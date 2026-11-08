function extractedGame(text){
  const blocks=[...text.matchAll(/```(?:html|htm)?[ \t]*\r?\n([\s\S]*?)```/gi)];
  for(const match of blocks.reverse())if(/<html(?:\s|>)/i.test(match[1])&&/<\/html\s*>/i.test(match[1]))return match[1].trim();
  const plain=text.trim();if(/^(?:<!doctype\s+html\s*>\s*)?<html(?:\s|>)/i.test(plain)&&/<\/html\s*>\s*$/i.test(plain))return plain;
  return null;
}
function gameCodeLineCount(text){
  const start=text.search(/<!doctype\s+html(?:\s|>)|<html(?:\s|>)/i);if(start<0)return 0;
  let code=text.slice(start);const end=code.match(/<\/html\s*>/i);if(end)code=code.slice(0,end.index+end[0].length);
  code=code.trim();return code?code.split(/\r\n|\r|\n/).length:0;
}
async function receiveGameHtml(payload,signal,onProgress=()=>{}){
  for(let attempt=0;attempt<2;attempt++){
    try{return await receiveGameHtmlOnce(payload,signal,onProgress)}catch(error){
      console.error('[공룡3 AI 응답 실패]',error);
      if(signal?.aborted)throw error;
      if(error.code!=='INCOMPLETE_HTML'||attempt===1){
        const friendly=Error('잘 안 됐어요. 다시 해봐요.',{cause:error});
        friendly.code=error.code;throw friendly;
      }
      onProgress(0,0);
    }
  }
}
async function receiveGameHtmlOnce(payload,signal,onProgress=()=>{}){
    let raw='',finish='',done=false,lastNotify=0,usage=null;
    let response;try{response=await fetch('/api/game',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal})}catch(error){
      if(signal?.aborted)throw error;
      if(typeof location!=='undefined'&&location.protocol==='file:')throw Error('AI 생성·수정은 수업 서버에서 사용할 수 있어요. http://127.0.0.1:8876/ 주소로 열어 주세요.');
      throw Error('수업 서버와 연결이 끊겼어요. 서버가 실행 중인지 확인한 뒤 다시 시도해 주세요. 기존 게임은 그대로 유지됩니다.');
    }
    if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'게임을 만들지 못했습니다. 다시 시도해 주세요.')}
    if(!response.body)throw Error('게임 코드가 도착하지 않았습니다. 다시 시도해 주세요.');
    const reader=response.body.getReader(),decoder=new TextDecoder();let pending='';
    function line(text){
      if(!text.startsWith('data:'))return;const payload=text.slice(5).trim();if(!payload)return;if(payload==='[DONE]'){done=true;return}
      let value;try{value=JSON.parse(payload)}catch{return}
      if(value.error)throw Error('생성 도중 응답이 끊겼습니다. 프롬프트를 확인하고 다시 시도해 주세요.');
      if(value.usage)usage=value.usage;const choice=value.choices?.[0];if(choice?.finish_reason)finish=choice.finish_reason;
      const content=choice?.delta?.content;if(typeof content==='string')raw+=content;
      if(Date.now()-lastNotify>180){lastNotify=Date.now();onProgress(raw.length,gameCodeLineCount(raw))}
    }
    try{for(;;){const {done:end,value}=await reader.read();if(end)break;pending+=decoder.decode(value,{stream:true});let at;while((at=pending.indexOf('\n'))!==-1){line(pending.slice(0,at).replace(/\r$/,''));pending=pending.slice(at+1)}}pending+=decoder.decode();if(pending)line(pending)}finally{reader.releaseLock()}
    if(finish==='length')throw Error('코드가 길어 생성을 끝내지 못했습니다. 프롬프트를 줄여 다시 시도해 주세요.');
    if(finish==='content_filter')throw Error('이 요청으로는 게임을 만들지 못했습니다. 프롬프트를 고쳐 다시 시도해 주세요.');
    if(!done&&!['stop','end_turn'].includes(finish))throw Error('생성 완료를 확인하지 못했습니다. 다시 시도해 주세요.');
    const html=extractedGame(raw);if(!html){
      const error=Error('완성된 HTML 코드를 받지 못했습니다. 다시 시도해 주세요.');
      error.code='INCOMPLETE_HTML';
      throw error;
    }
    const lines=gameCodeLineCount(html);onProgress(raw.length,lines);return {html,usage,lines};
}

(()=>{
const READING={
 P5:[
  {t:'营地里的第一晚',words:['露营','探险','手电筒','防止','单独','贵重','安排','营火会','物品清单','齐心协力'],x:'学校安排五年级学生到野外露营。出发前，老师提醒大家按照物品清单收拾睡袋、防蚊用品和手电筒，也不要带贵重物品。到达营地后，同学们分组搭帐篷，谁也不能单独离开。傍晚，大家齐心协力准备营火会。听着老师分享探险故事，我们学会了怎样防止意外，也度过了难忘的第一晚。'},
  {t:'失物招领处的好消息',words:['小贩中心','车资卡','钞票','硬币','丢失','招领','认领','诚实','善良','喜出望外'],x:'早晨，妈妈在小贩中心买早餐时，发现装着车资卡、钞票和硬币的钱包丢失了。我们马上向员工求助，并到招领处留下联系电话。下午，一位诚实又善良的阿姨送来了钱包。妈妈核对资料后顺利认领，发现里面的东西一样不少，顿时喜出望外。她向阿姨道谢，也提醒我要好好保管自己的物品。'}
 ],
 P6:[
  {t:'为目标坚持到底',words:['克服','锻炼','测验','严格','勤奋','懒惰','计划','压力','战胜','目标','动力','面对'],x:'小杰的目标是参加学校田径队。为了通过测验，他按照严格的训练计划，每天早起锻炼。天气炎热时，他也曾感到压力，甚至想偷懒。教练告诉他，勤奋不是从不疲倦，而是愿意面对困难、克服弱点。家人的鼓励给了他继续前进的动力。几个月后，他终于战胜自己，跑出了个人最好成绩，也明白成功不能依靠临时努力。'},
  {t:'祖孙同乐日',words:['祖孙','促进','家庭','和谐','智能手机','闯关','祖父母节','一系列','目的','轮椅','方便','贴心'],x:'学校在祖父母节举办祖孙同乐日，目的是促进家庭关系，让长辈了解孩子的校园生活。活动包括一系列闯关游戏、智能手机讲座和手工制作。礼堂旁设置了轮椅通道，方便行动不便的长者。学生还准备了贴心的茶点和感谢卡。看见祖孙一起欢笑，我感受到和谐家庭带来的温暖，也学会更主动地关心长辈。'}
 ]
};
R.P5.splice(0,R.P5.length,...READING.P5);R.P6.splice(0,R.P6.length,...READING.P6);
const escapeRx=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const steps=[['看法','清楚回应','op'],['原因','说明为什么','reason'],['解释','深入说明','explain'],['经历','举例分享','experience'],['建议','提出做法','suggest']];
let speechId='',recordStarted=0,recordClock=null,readBase='',oralBase='';
const originalRenderTopic=renderTopic;
function currentPassage(){return R[$('#grade').value][+$('#passageSelect').value||0]}
function splitSpeech(text){let a=(text.match(/[^。！？；]+[。！？；]?/g)||[text]).map(x=>x.trim()).filter(Boolean);let out=[];a.forEach(s=>{if(s.length<95)out.push(s);else for(let i=0;i<s.length;i+=80)out.push(s.slice(i,i+80))});return out}
function refreshSpeech(){
 const rb=$('#readAloud'),rs=$('#readPlayState');
 if(rb){let on=speechId==='reading';rb.textContent=on?'⏹ 停止范读':'🔊 播放范读';rb.classList.toggle('button-playing',on);if(rs){rs.classList.toggle('hidden-v6',!on)}}
 $$('[data-listen]').forEach(b=>{let id='q'+b.dataset.listen,on=speechId===id;b.textContent=on?'⏹ 停止听题':'🔊 听题';b.classList.toggle('button-playing',on)});
 const sb=$('#sampleAudio');if(sb){let on=speechId==='sample';sb.textContent=on?'⏹ 停止完整参考答案':'🔊 播放完整参考答案';sb.classList.toggle('button-playing',on)}
}
speak=function(text,id){
 if(!('speechSynthesis'in window))return toast('这个浏览器不支持语音播放。');
 if(speechId===id){speechSynthesis.cancel();speechId='';speaking='';refreshSpeech();return}
 speechSynthesis.cancel();speechId=id;speaking=id;refreshSpeech();let parts=splitSpeech(text),n=0;
 const next=()=>{if(speechId!==id)return;if(n>=parts.length){speechId='';speaking='';refreshSpeech();return}let u=new SpeechSynthesisUtterance(parts[n++]);u.lang='zh-SG';u.rate=.82;u.onend=next;u.onerror=()=>{speechId='';speaking='';refreshSpeech()};speechSynthesis.speak(u)};next();
};
function ensureReadingUI(){
 let passage=$('#passageText');if(!passage)return;
 if(!$('#wordBank')){passage.insertAdjacentHTML('afterend','<div id="wordBank" class="word-bank"><div class="word-bank-title">本篇重点词语（来自《欢乐伙伴》生字／词语表）</div><div id="wordChips" class="word-chips"></div><p class="small-note">蓝色词语是本篇练习重点。点击词语可听正确读音。</p></div>')}
 let row=$('#readAloud').closest('.row');if(!$('#readPlayState'))row.insertAdjacentHTML('afterend','<div id="readPlayState" class="activity-state hidden-v6"><span class="sound-bars"><i></i><i></i><i></i></span><span>正在播放范读。再次点击“停止范读”便可停止。</span></div><div id="readRecordState" class="activity-state hidden-v6"><span class="pulse-dot"></span><span>正在录音 <b id="readTimer">00:00</b>。读完后请点击“结束录音”。</span></div>');
 let ta=$('#readTranscript');if(ta&&!ta.closest('.transcript-wrap')){let w=document.createElement('div');w.className='transcript-wrap';ta.parentNode.insertBefore(w,ta);w.appendChild(ta);w.insertAdjacentHTML('afterbegin','<div class="transcript-heading">系统识别到的朗读文字</div><p class="transcript-help">这个方格会把你的朗读转成文字，帮助系统检查重点词语是否读得清楚。它不是作文题；如识别有误，你可以自行修正。</p>');ta.placeholder='录音时，系统识别到的文字会显示在这里。'}
 $('#readFeedback').textContent='查看朗读反馈';
}
showPassage=function(){
 ensureReadingUI();let p=currentPassage(),words=p.words||[];let rx=new RegExp('('+words.slice().sort((a,b)=>b.length-a.length).map(escapeRx).join('|')+')','g');
 $('#passageTitle').textContent=p.t;$('#passageText').innerHTML=p.x.replace(rx,'<span class="target-word" tabindex="0" data-word="$1">$1</span>');
 $('#wordChips').innerHTML=words.map(w=>`<button class="word-chip" data-word="${w}">${w}</button>`).join('');$('#readResult').innerHTML='';$('#readTranscript').value='';$('#readAudio').classList.add('hidden');$('#readAudio').removeAttribute('src');
 $('#readStatus').textContent='先听范读，再点击“开始录音”。录音结束后，系统会自动显示反馈。';refreshSpeech();
};
renderReading=function(){let g=$('#grade').value,a=R[g];$('#passageSelect').innerHTML=a.map((p,i)=>`<option value="${i}">${i+1}. ${p.t}</option>`).join('');showPassage()};
function startClock(type,i){recordStarted=Date.now();clearInterval(recordClock);recordClock=setInterval(()=>{let s=Math.floor((Date.now()-recordStarted)/1000),v=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');let el=type==='reading'?$('#readTimer'):document.querySelector(`[data-rec-state="${i}"] b`);if(el)el.textContent=v},500)}
function stopClock(){clearInterval(recordClock);recordClock=null}
function beginRecognition(type,i){
 let SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){toast('录音会保存，但这个浏览器没有提供语音转文字。你仍可听回录音，或在文字方格中补上内容。');return}
 recognition=new SR();recognition.lang='zh-SG';recognition.continuous=true;recognition.interimResults=true;
 if(type==='reading'){readBase=$('#readTranscript').value.trim()}else{oralBase=(answers[i]?.text||'').trim()}
 recognition.onresult=e=>{let final='',interim='';for(let j=0;j<e.results.length;j++){let t=e.results[j][0].transcript;if(e.results[j].isFinal)final+=t;else interim+=t}let value=((type==='reading'?readBase:oralBase)+' '+final+' '+interim).trim();if(type==='reading')$('#readTranscript').value=value;else{answers[i].text=value;let ta=document.querySelector(`[data-text="${i}"]`);if(ta)ta.value=value}};
 recognition.onerror=e=>{if(e.error!=='no-speech')toast('语音转文字暂时没有成功；录音仍会保存，你可以听回并自行补充文字。')};try{recognition.start()}catch{}
}
function recordingUI(type,i,on){
 if(type==='reading'){$('#readRecordState').classList.toggle('hidden-v6',!on);$('#readRecord').classList.toggle('recording',on);$('#readRecord').textContent=on?'⏹ 结束录音':($('#readAudio').src?'🎙️ 重新录音':'🎙️ 开始录音');$('#readStatus').textContent=on?'麦克风正在录音。请看着篇章朗读，完成后点击“结束录音”。':'录音已保存。你可以先播放录音，再查看反馈。'}
 else{let c=document.querySelector(`[data-rec="${i}"]`)?.closest('.qcard');c?.classList.toggle('recording-card',on);if(on&&!c.querySelector('[data-rec-state]'))c.insertAdjacentHTML('afterbegin',`<div class="activity-state recording" data-rec-state="${i}"><span class="pulse-dot"></span><span>正在录音 <b>00:00</b>。说完后点击“停止录音”。</span></div>`)}
}
toggleRecord=async function(i,type='oral'){
 if(media&&media.state==='recording'){stopRecord();return}
 try{stream=await getMic();chunks=[];recQ=i;media=new MediaRecorder(stream);media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};media.onstop=()=>{stopClock();let blob=new Blob(chunks,{type:media.mimeType||'audio/webm'}),url=URL.createObjectURL(blob);if(type==='oral'){answers[i].audio=url;answers[i].done=true}else{$('#readAudio').src=url;$('#readAudio').classList.remove('hidden')}stream?.getTracks().forEach(t=>t.stop());stream=null;try{recognition?.stop()}catch{}recognition=null;recordingUI(type,i,false);recQ=-1;if(type==='oral')renderTopic();else setTimeout(readFeedback,120);};media.start(250);beginRecognition(type,i);if(type==='oral')renderTopic();recordingUI(type,i,true);startClock(type,i);toast('录音已开始。红色提示会一直显示，直到你点击停止。')}catch{}
};
stopRecord=function(){try{recognition?.stop()}catch{}if(media?.state==='recording')media.stop()};
function markWords(hit){$$('.target-word,.word-chip').forEach(x=>{let ok=hit.includes(x.dataset.word);x.classList.toggle('hit',ok);x.classList.toggle('miss',!ok)})}
readFeedback=function(){
 let txt=$('#readTranscript').value.replace(/\s/g,''),p=currentPassage(),hasAudio=!!$('#readAudio').src;if(!txt&&!hasAudio)return toast('请先完成录音。');let hit=(p.words||[]).filter(w=>txt.includes(w)),miss=(p.words||[]).filter(w=>!txt.includes(w));markWords(hit);
 if(!txt){$('#readResult').innerHTML='<div class="feedback warn"><h4>录音已保存，但暂时没有识别到文字</h4><p>你仍可以播放录音自我检查。点击上方蓝色重点词语，听清楚后再读一次；也可在“系统识别到的朗读文字”方格中补上你读到的内容，再点击查看反馈。</p><p class="small-note">语音转文字受浏览器、网络和环境声音影响，并不代表你的发音一定错误。</p></div>';return}
 let score=Math.round(hit.length/Math.max(1,p.words.length)*100),tone=score>=80?'ok':score>=55?'warn':'bad';$('#readResult').innerHTML=`<div class="feedback ${tone}"><h4>朗读反馈：重点词语清楚识别 ${hit.length}/${p.words.length}</h4><p>${score>=80?'大部分重点词语都被清楚识别。下一次可注意自然停顿和语气。':score>=55?'你已经读清楚一部分重点词语。请点击红色词语听读音，再分句重读。':'建议先听范读，把篇章分成短句，再重点练习红色词语。'}</p><div class="read-feedback-grid"><div class="good"><b>已经识别</b><p>${hit.length?hit.join('、'):'暂时没有'}</p></div><div class="practice"><b>再练一练</b><p>${miss.length?miss.join('、'):'没有，做得好！'}</p></div></div><p class="small-note">这是浏览器语音识别提供的练习参考。请同时播放自己的录音，检查音量、停顿和语气。</p></div>`
};
function responseMetrics(x){return metrics(x||'')}
function sampleIdea(i){let s=(T[topic].sample.match(/[^。！？]+[。！？]?/g)||[T[topic].sample]);return (s[Math.min(i,s.length-1)]||s[0]).trim()}
function feedbackFor(i){let a=answers[i]?.text?.trim()||'',m=responseMetrics(a),len=a.replace(/\s/g,'').length,found=Object.values(m).filter(Boolean).length,missing=steps.filter(x=>!m[x[2]]);let main=missing[0];let praise=len>45?`你的回答已经较完整，也运用了 ${found} 个表达方向。`:len>18?'你已经回应了问题，内容有一个清楚的起点。':'你的回答已经开始回应问题；下一步请把想法说得更具体。';let prompt=main?`${main[0]}方面可以再加强：${main[1]}。`:'五个表达方向都出现了，可以再注意自然衔接和语气。';return `<div class="question-feedback"><strong>第 ${i+1} 题反馈</strong><p>${praise}${prompt}</p><div class="model-checks">${steps.map(s=>`<span class="model-chip ${m[s[2]]?'hit':'miss'}">${m[s[2]]?'✓':'再补'} ${s[0]}</span>`).join('')}</div>${main?`<div class="teacher-prompt"><b>老师会追问：</b>${main[2]==='op'?'你对这件事的明确看法或感受是什么？':main[2]==='reason'?'你为什么这样想？请说出一个原因。':main[2]==='explain'?'这样做会带来什么影响或结果？':main[2]==='experience'?'你有亲身经历或具体例子吗？':'你会建议谁怎样做？'}</div>`:''}<div class="sample-direction"><b>可参考答案的思考方向：</b>${sampleIdea(i)}<br><small>请用自己的经历和语言回答，不必背诵。</small></div></div>`}
showOverall=function(){
 let all=answers.map(a=>a.text||'').join(' '),m=responseMetrics(all),used=Object.values(m).filter(Boolean).length,weak=steps.filter(s=>!m[s[2]]),short=answers.map((a,i)=>({i,n:(a.text||'').replace(/\s/g,'').length})).sort((a,b)=>a.n-b.n)[0];$('#overall').innerHTML=`<h3>整套口语反馈</h3><p>你已完成三道问题。系统把三次回答合起来，从五个方向提供反馈。</p><div class="model-summary">${steps.map(s=>`<div class="${m[s[2]]?'done':'next'}"><b>${s[0]}</b>${m[s[2]]?'已经运用':'下一步加强'}</div>`).join('')}</div>${answers.map((a,i)=>feedbackFor(i)).join('')}<div class="feedback warn"><h4>下一轮练习</h4><p>${weak.length?`先加强“${weak[0][0]}”：${weak[0][1]}。`:'五个方向都运用了。请重录最短的一题，让语气更自然、例子更具体。'} 建议重练第 ${short.i+1} 题。</p></div><div class="feedback"><h4>怎样使用参考答案</h4><p>先比较参考答案用了哪些原因、解释、经历或建议，再用自己的话补充。参考答案是学习方向，不是唯一正确答案。</p></div>`;$('#overall').classList.remove('hidden');if(profile&&!profile.topics.includes(topic)){profile.topics.push(topic);save();$('#topicProgress').textContent=`已完成 ${profile.topics.length} / ${T.length} 个话题`}
};
function enhanceTopic(){
 $$('.qcard').forEach((card,i)=>{let ta=card.querySelector('textarea');if(ta&&!ta.closest('.transcript-wrap')){let w=document.createElement('div');w.className='transcript-wrap';ta.parentNode.insertBefore(w,ta);w.appendChild(ta);w.insertAdjacentHTML('afterbegin','<div class="transcript-heading">系统识别到的回答文字</div><p class="transcript-help">这个方格显示录音转换成的文字，系统会根据这些文字提供反馈。它不是让你先打字作答；若识别有误，可在录音后修正。</p>');ta.placeholder='录音时，系统识别到的回答会显示在这里。'}let saveBtn=card.querySelector('[data-save]');if(saveBtn)saveBtn.textContent='保存／更新识别文字';if(answers[i]?.done||answers[i]?.text?.trim())card.insertAdjacentHTML('beforeend',feedbackFor(i));if(recQ===i)recordingUI('oral',i,true)});
 let complete=answers.length===T[topic].questions.length&&answers.every(a=>a.done||a.text.trim().length>8),details=$('#sample')?.closest('details');let old=$('#sampleLock');if(old)old.remove();if(details){details.classList.toggle('sample-ready',complete);details.hidden=!complete;if(complete){details.querySelector('summary').textContent='最后一步：查看并聆听完整参考答案';details.open=false}else $('#questions').insertAdjacentHTML('afterend','<div id="sampleLock" class="sample-lock">🔒 完成并保存三道问题后，才会开放完整参考答案及整篇播放。</div>')}
 refreshSpeech();
}
renderTopic=function(){originalRenderTopic();enhanceTopic()};
document.addEventListener('click',e=>{let w=e.target.closest('[data-word]');if(w)speak(w.dataset.word,'word:'+w.dataset.word)});
ensureReadingUI();renderReading();renderTopic();refreshSpeech();
})();
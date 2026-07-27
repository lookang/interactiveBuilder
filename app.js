const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const PROFILE_STORE_KEY = "oralAppProfilesV4";
const ACTIVE_PROFILE_KEY = "oralAppActiveProfileKeyV4";
const CLOUD_PROGRESS_ENDPOINT = "/api/progress";
let cloudSyncTimer = null;
function storageGet(key){try{return window.localStorage?.getItem(key)??null;}catch{return null;}}
function storageSet(key,value){try{window.localStorage?.setItem(key,value);return true;}catch{return false;}}
function uniqueValues(values){return [...new Set((values||[]).filter(v=>v!==null&&v!==undefined))];}
function mergeHistory(local=[],cloud=[]){
  const seen=new Set(),merged=[];
  for(const item of [...cloud,...local]){const key=[item?.type,item?.id,item?.title,item?.score,item?.iso||item?.date].join('|');if(!seen.has(key)){seen.add(key);merged.push(item);}}
  return merged.sort((a,b)=>Date.parse(b?.iso||b?.date||0)-Date.parse(a?.iso||a?.date||0)).slice(0,60);
}
function mergeProgress(local,cloud,name,className){
  const a=sanitizeProgress(local,name,className),b=sanitizeProgress(cloud,name,className);
  return {...a,name:cleanIdentityDisplay(name),className:cleanIdentityDisplay(className),stars:Math.max(a.stars,b.stars),reading:uniqueValues([...a.reading,...b.reading]),conversation:uniqueValues([...a.conversation,...b.conversation]),history:mergeHistory(a.history,b.history),lastAccessed:[a.lastAccessed,b.lastAccessed].sort().pop()||''};
}
function cloudProgressPayload(){return {name:state.progress.name,className:state.progress.className,stars:state.progress.stars||0,reading:state.progress.reading||[],conversation:state.progress.conversation||[],history:(state.progress.history||[]).slice(0,60),lastAccessed:state.progress.lastAccessed||new Date().toISOString()};}
function queueCloudSync(){clearTimeout(cloudSyncTimer);if(!state.activeProfileKey)return;cloudSyncTimer=setTimeout(async()=>{try{await fetch(CLOUD_PROGRESS_ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(cloudProgressPayload())});}catch{}},500);}
async function hydrateFromCloud(name,className,key){
  try{const u=new URL(CLOUD_PROGRESS_ENDPOINT,location.origin);u.searchParams.set('name',name);u.searchParams.set('className',className);const r=await fetch(u);if(!r.ok)return;const cloud=await r.json();if(!cloud||key!==state.activeProfileKey)return;state.progress=mergeProgress(state.progress,cloud,name,className);state.profiles[key]=state.progress;storageSet(PROFILE_STORE_KEY,JSON.stringify(state.profiles));updateHeader();renderSavedProfiles();renderReading();renderConversation({resetSession:false});showToast('已同步教师看板中的累计进度。');}catch{}
}

function emptyProgress(name="", className="") { return {stars:0, reading:[], conversation:[], history:[], name, className, lastAccessed:""}; }
function cleanIdentityDisplay(value){ return (value||"").trim().replace(/\s+/g," "); }
function normalizeIdentity(value){ return cleanIdentityDisplay(value).toLocaleLowerCase("en-SG"); }
function makeProfileKey(name,className){ return `${normalizeIdentity(name)}::${normalizeIdentity(className)}`; }
function sanitizeProgress(raw,name="",className=""){
  const safe=raw&&typeof raw==="object"?raw:{};
  return {stars:Number(safe.stars)||0,reading:Array.isArray(safe.reading)?safe.reading:[],conversation:Array.isArray(safe.conversation)?safe.conversation:[],history:Array.isArray(safe.history)?safe.history.slice(0,60):[],name:cleanIdentityDisplay(safe.name||name),className:cleanIdentityDisplay(safe.className||className),lastAccessed:safe.lastAccessed||""};
}
function loadProfiles(){
  let profiles={};
  for(const key of [PROFILE_STORE_KEY,"oralAppProfilesV2"]){
    try{const saved=JSON.parse(storageGet(key));if(saved&&typeof saved==="object")profiles={...saved,...profiles};}catch{}
  }
  Object.keys(profiles).forEach(key=>{const p=profiles[key];profiles[key]=sanitizeProgress(p,p?.name,p?.className);});
  return profiles;
}
function resolveInitialProfile(profiles){const key=storageGet(ACTIVE_PROFILE_KEY)||storageGet("oralAppActiveProfileKeyV2")||"";return key&&profiles[key]?{key,progress:profiles[key]}:{key:"",progress:emptyProgress()};}
const initialProfiles=loadProfiles();
const initialProfile=resolveInitialProfile(initialProfiles);


const state={view:"home",grade:"P5",passageIndex:0,topicIndex:0,recordingType:null,recognition:null,mediaRecorder:null,mediaStream:null,audioChunks:[],transcript:"",interimTranscript:"",allowRecognitionRestart:false,isModelReading:false,speakingKey:"",speechQueue:[],timerId:null,seconds:0,profiles:initialProfiles,activeProfileKey:initialProfile.key,progress:initialProfile.progress,conversationAnswers:[],activeQuestionIndex:0,recordingQuestionIndex:null,conversationAnalysis:null,conversationMarkedComplete:false,coachQuestionIndex:0,feedbackSpeechText:""};

function escapeHtml(s){return String(s??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
function escapeRegex(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function showToast(message){const toast=$("#toast");toast.textContent=message;toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove("show"),3000);}
function saveProgress(){if(state.activeProfileKey){state.progress.lastAccessed=new Date().toISOString();state.profiles[state.activeProfileKey]=state.progress;storageSet(PROFILE_STORE_KEY,JSON.stringify(state.profiles));storageSet(ACTIVE_PROFILE_KEY,state.activeProfileKey);queueCloudSync();}updateHeader();renderSavedProfiles();}
function updateHeader(){
  $("#starCount").textContent=state.progress.stars||0;
  const name=state.progress.name?.trim();$("#greeting").textContent=name?`欢迎回来，${name}！`:"欢迎回来，小朋友！";
  const status=$("#activeProfileStatus");if(status){status.textContent=state.activeProfileKey?`当前档案：${state.progress.name}（${state.progress.className}）｜同一姓名和班级会继续累积进度。`:"尚未载入学生档案。请先输入姓名和班级。";status.classList.toggle("active",Boolean(state.activeProfileKey));}
  $("#progressProfileLabel").textContent=state.activeProfileKey?`${state.progress.name} · ${state.progress.className}`:"尚未载入档案";
}
function renderSavedProfiles(){const row=$("#savedProfileRow"),select=$("#savedProfileSelect");const entries=Object.entries(state.profiles).sort((a,b)=>(Date.parse(b[1].lastAccessed||0)||0)-(Date.parse(a[1].lastAccessed||0)||0));row.classList.toggle("hidden",!entries.length);select.innerHTML=entries.map(([key,p])=>`<option value="${escapeHtml(key)}" ${key===state.activeProfileKey?"selected":""}>${escapeHtml(p.name)} · ${escapeHtml(p.className)}</option>`).join("");}
function activateProfile(name,className,{silent=false}={}){
  const cleanName=cleanIdentityDisplay(name),cleanClass=cleanIdentityDisplay(className);
  if(!cleanName||!cleanClass){showToast("请先输入姓名和班级。");(!cleanName?$("#studentName"):$("#studentClass"))?.focus();return false;}
  if(state.activeProfileKey)state.profiles[state.activeProfileKey]=state.progress;
  const key=makeProfileKey(cleanName,cleanClass),existed=Boolean(state.profiles[key]);state.activeProfileKey=key;state.progress=existed?sanitizeProgress(state.profiles[key],cleanName,cleanClass):emptyProgress(cleanName,cleanClass);state.progress.name=cleanName;state.progress.className=cleanClass;$("#studentName").value=cleanName;$("#studentClass").value=cleanClass;saveProgress();renderReading();renderConversation();hydrateFromCloud(cleanName,cleanClass,key);if(!silent)showToast(existed?`已载入 ${cleanName}（${cleanClass}）的累计进度。`:`已为 ${cleanName}（${cleanClass}）建立新档案。`);return true;
}
function ensureActiveProfile(){return state.activeProfileKey||activateProfile($("#studentName")?.value,$("#studentClass")?.value);}
function navigate(view){
  if(["reading","conversation","progress"].includes(view)&&!ensureActiveProfile()){view="home";}
  if(state.recordingType)stopRecording();stopSpeaking();state.view=view;$$('.view').forEach(v=>v.classList.remove('active-view'));$("#"+view+"View").classList.add('active-view');$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));$(".sidebar").classList.remove("open");if(view==="reading")renderReading();if(view==="conversation")renderConversation({resetSession:false});if(view==="progress")renderProgress();window.scrollTo({top:0,behavior:"smooth"});
}

function renderReading(){
  stopSpeaking();const passages=readingData[state.grade];if(state.passageIndex>=passages.length)state.passageIndex=0;const passage=passages[state.passageIndex];$$('.grade-btn').forEach(b=>b.classList.toggle('active',b.dataset.grade===state.grade));$("#passageListTitle").textContent=`${state.grade} 朗读篇章`;$("#passageProgress").textContent=`${state.progress.reading.filter(id=>id.startsWith(state.grade+'-')).length} / ${passages.length}`;$("#passageList").innerHTML=passages.map((p,i)=>`<button data-passage="${i}" class="${i===state.passageIndex?'active':''} ${state.progress.reading.includes(`${state.grade}-${i}`)?'completed':''}">${i+1}. ${escapeHtml(p.title)}</button>`).join('');$("#passageTitle").textContent=passage.title;renderPassageText(passage);resetReadingFeedback();$("#prevPassage").disabled=state.passageIndex===0;$("#nextPassage").textContent=state.passageIndex===passages.length-1?"回到第一篇":"下一篇";
}
function renderPassageText(passage,statuses={}){
  const targetWords=Array.isArray(passage.targetWords)?passage.targetWords:[];
  if(!targetWords.length){$("#passageText").textContent=passage.text;$("#targetWordChips").innerHTML='';return;}
  const words=[...targetWords].sort((a,b)=>b.length-a.length),regex=new RegExp(`(${words.map(escapeRegex).join('|')})`,'g');
  $("#passageText").innerHTML=passage.text.split(regex).map(part=>targetWords.includes(part)?`<button class="word-token ${statuses[part]||''}" data-speak-word="${escapeHtml(part)}" title="点击听正确读音">${escapeHtml(part)}</button>`:escapeHtml(part)).join('');
  $("#targetWordChips").innerHTML=targetWords.map(word=>`<button class="target-word-chip ${statuses[word]||''}" data-speak-word="${escapeHtml(word)}">🔊 ${escapeHtml(word)}</button>`).join('');
}
function updateModelReadingButton(){
  const btn=$("#playModelReading"),status=$("#modelReadingStatus");if(!btn)return;
  btn.textContent=state.isModelReading?"⏹ 停止范读":"🔊 播放范读";btn.classList.toggle('speaking',state.isModelReading);
  if(status){status.classList.toggle('active',state.isModelReading);status.querySelector('span:last-child').textContent=state.isModelReading?'正在播放范读……再次点击按钮即可停止。':'点击“播放范读”听完整篇章。';}
}
function updateConversationSpeechButtons(){
  $$('[data-speak-question]').forEach(btn=>{const key=`question-${btn.dataset.speakQuestion}`;btn.classList.toggle('speaking',state.speakingKey===key);const label=btn.querySelector('.question-listen-label');if(label)label.textContent=state.speakingKey===key?'停止':'听题';});
  const sample=$("#sampleAnswerAudioBtn");if(sample){const playing=state.speakingKey==='sample-answer';sample.classList.toggle('speaking',playing);sample.textContent=playing?'⏹ 停止完整参考答案':'🔊 播放完整参考答案';const status=$("#sampleAudioStatus");if(status)status.textContent=playing?'正在朗读完整参考答案……再次点击即可停止。':'可随时点击停止。先比较内容，再用自己的语言重练。';}
  const allFeedback=$("#feedbackAudioBtn");if(allFeedback){const playing=state.speakingKey==='all-feedback';allFeedback.classList.toggle('speaking',playing);allFeedback.textContent=playing?'⏹ 停止朗读反馈':'🔊 朗读全部反馈';}
  $$('[data-speak-feedback]').forEach(btn=>{const key=`feedback-${btn.dataset.speakFeedback}`;btn.classList.toggle('speaking',state.speakingKey===key);btn.textContent=state.speakingKey===key?'⏹ 停止':'🔊 朗读';});
}
function stopSpeaking(){if('speechSynthesis'in window)speechSynthesis.cancel();state.speechQueue=[];state.speakingKey="";state.isModelReading=false;updateModelReadingButton();updateConversationSpeechButtons();}
function splitSpeechText(text){const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean)return[];const parts=clean.match(/[^。！？!?；;]+[。！？!?；;]?/g)||[clean],chunks=[];let current='';for(const part of parts){if((current+part).length>150&&current){chunks.push(current);current=part;}else current+=part;}if(current)chunks.push(current);return chunks;}
function speak(text,rate=.88,{model=false,key=""}={}){
  if(!('speechSynthesis'in window)){showToast('这个浏览器不支持语音播放。');return;}
  if(state.recordingType){showToast('请先结束录音，再播放语音。');return;}
  if(key&&state.speakingKey===key){stopSpeaking();return;}
  stopSpeaking();state.speakingKey=key||'';state.isModelReading=Boolean(model);state.speechQueue=splitSpeechText(text);updateModelReadingButton();updateConversationSpeechButtons();
  const voices=speechSynthesis.getVoices(),preferred=voices.find(v=>/^zh-SG/i.test(v.lang))||voices.find(v=>/^zh-(CN|TW|HK)/i.test(v.lang))||voices.find(v=>/^zh/i.test(v.lang));
  const next=()=>{if(!state.speechQueue.length){state.speakingKey='';state.isModelReading=false;updateModelReadingButton();updateConversationSpeechButtons();return;}const u=new SpeechSynthesisUtterance(state.speechQueue.shift());u.lang='zh-SG';u.rate=rate;u.pitch=1;if(preferred)u.voice=preferred;u.onend=next;u.onerror=()=>{state.speechQueue=[];state.speakingKey='';state.isModelReading=false;updateModelReadingButton();updateConversationSpeechButtons();};speechSynthesis.speak(u);};next();
}
function resetReadingFeedback(){
  $("#readingFeedback").classList.add('hidden');$("#readingRecordStatus").textContent='准备好后，点击“开始录音”';$("#readingTimer").textContent='00:00';$("#readingPlayback").hidden=true;$("#readingRecordBtn").classList.remove('recording','requesting');$("#readingRecordBtnLabel").textContent='开始录音';$("#readingLiveDot").classList.remove('active');$("#readingRecordingCard").classList.remove('is-recording');$("#readingTranscriptEditor").value='';$("#readingRecognitionState").textContent='等待录音';$("#readingRecognitionState").className='recognition-state';$("#readingRecognitionHint").textContent='录音结束后会自动检查；没有文字时也会说明下一步。';
}


function cleanSampleParagraphs(topic){const seen=new Set();return String(topic.sample||'').split(/\n\s*\n+/).map(p=>p.trim().replace(/^[-－]\s*/,'' )).filter(p=>{if(!p||seen.has(p))return false;seen.add(p);return true;});}
function sampleSegments(topic){const count=topic.questions.length,paras=cleanSampleParagraphs(topic),groups=Array.from({length:count},()=>[]);if(!paras.length)return groups.map((_,i)=>topic.prompts[i]||'');paras.forEach((p,i)=>groups[Math.min(count-1,Math.floor(i*count/paras.length))].push(p));return groups.map(g=>g.join('\n\n'));}
function newConversationAnswers(topic){return topic.questions.map((question,index)=>({question,index,text:'',audioUrl:'',seconds:0,recorded:false}));}
function cleanupConversationAudio(){state.conversationAnswers.forEach(a=>{if(a.audioUrl)URL.revokeObjectURL(a.audioUrl);});}
function resetConversationSession(){cleanupConversationAudio();const topic=conversationTopics[state.topicIndex];state.conversationAnswers=newConversationAnswers(topic);state.activeQuestionIndex=0;state.recordingQuestionIndex=null;state.conversationAnalysis=null;state.conversationMarkedComplete=false;state.coachQuestionIndex=0;resetConversationFeedback();}
function resetConversationFeedback(){$('#conversationProgressSummary').textContent='尚未开始回答。';$('#questionFeedbackList').innerHTML='';$('#feedbackAudioBtn').classList.add('hidden');state.feedbackSpeechText='';$('#rubricFeedback').classList.add('hidden');$('#sampleInsightBox').classList.add('hidden');$('#conversationOverall').classList.add('hidden');$('#teacherCoach').classList.add('hidden');}
function updateSampleAnswerAccess(){const ready=allConversationQuestionsAnswered();const locked=$("#sampleLockedMessage"),details=$("#sampleAnswerDetails");if(locked)locked.classList.toggle('hidden',ready);if(details){details.classList.toggle('hidden',!ready);if(!ready)details.open=false;}}

function renderEmptyRubric(){$("#rubricFeedback").innerHTML=['看法','原因','解释','经历','建议'].map(label=>`<div><span>○</span><p><strong>${label}</strong><small>${criterionFor(label)}</small></p></div>`).join('');}
function criterionFor(label){return {看法:'清楚说明看法或感受',原因:'说明为什么',解释:'深入说明影响、结果或道理',经历:'分享个人经历或具体例子',建议:'提出可行的做法'}[label];}
function renderConversation({resetSession=true}={}){
  stopSpeaking();const topic=conversationTopics[state.topicIndex];if(resetSession||state.conversationAnswers.length!==topic.questions.length)resetConversationSession();
  $("#topicCounter").textContent=`话题 ${state.topicIndex+1} / ${conversationTopics.length}`;$("#topicCountHome").textContent=`${conversationTopics.length} 个话题等你来挑战`;$("#topicSelect").innerHTML=conversationTopics.map((t,i)=>`<option value="${i}" ${i===state.topicIndex?'selected':''}>${state.progress.conversation.includes(i)?'✓ ':''}${i+1}. ${escapeHtml(t.title)}（${escapeHtml(t.group)}）</option>`).join('');$("#topicCompletionHint").textContent=`已完成 ${state.progress.conversation.length} / ${conversationTopics.length} 个话题`;$("#topicTitle").textContent=`话题 ${state.topicIndex+1}：${topic.title}`;$("#topicScenario").textContent=topic.scenario;$("#topicFocus").textContent=topic.focus;$("#sampleAnswerText").innerHTML=cleanSampleParagraphs(topic).map(p=>`<p>${escapeHtml(p)}</p>`).join('');$("#prevTopic").disabled=state.topicIndex===0;$("#nextTopic").textContent=state.topicIndex===conversationTopics.length-1?'回到第一题':'下一题';renderConversationQuestions();updateSampleAnswerAccess();updateConversationSpeechButtons();
}
function answerStatus(answer,index){if(answer.text)return'已保存回答文字';if(answer.recorded)return'录音已保存；没有识别文字也可继续';if(index===state.activeQuestionIndex)return'现在回答';return'待回答';}
function renderConversationQuestions(){
  const topic=conversationTopics[state.topicIndex],answered=state.conversationAnswers.filter(a=>a.recorded||normalizeChinese(a.text).length).length;
  $("#topicQuestionList").innerHTML=topic.questions.map((q,i)=>{const a=state.conversationAnswers[i]||{},active=i===state.activeQuestionIndex,locked=i>state.activeQuestionIndex&&!a.recorded&&!a.text,recording=state.recordingType==='conversation'&&state.recordingQuestionIndex===i;return `<article class="question-practice ${active?'active':''} ${(a.recorded||a.text)?'answered':''} ${recording?'is-recording':''}">
    <button class="question-speak-main" data-speak-question="${i}" aria-label="朗读第${i+1}题"><span class="question-number">${i+1}</span><span class="question-copy">${escapeHtml(q)}</span><span class="question-listen">🔊 <b class="question-listen-label">听题</b></span></button>
    <div class="question-practice-meta"><span class="question-state">${recording?'🔴 正在录音':answerStatus(a,i)}</span><span id="questionTimer-${i}" class="question-timer">${formatTime(a.seconds||0)}</span></div>
    <div class="question-record-row"><button class="question-record-btn ${recording?'recording':''}" data-record-question="${i}" ${locked?'disabled':''}>${recording?'⏹ 结束录音':a.recorded?'🎙️ 重新录音':'🎙️ 录音回答'}</button>${a.audioUrl?`<audio controls src="${a.audioUrl}" aria-label="播放第${i+1}题的录音"></audio>`:''}</div>
    <div class="question-transcript"><div class="question-transcript-heading"><label for="answerEditor-${i}">系统识别到的回答文字</label><span>${recording?'正在识别……':'用于提供反馈'}</span></div><p>这不是作答框。浏览器会把你的声音转成文字，让系统参考内容提供反馈；若有错字，可自行修正。</p><textarea id="answerEditor-${i}" data-answer-editor="${i}" placeholder="录音时，系统识别到的回答会显示在这里。若没有出现文字，你仍可继续下一题，最后会收到练习方向。">${escapeHtml(a.text||'')}</textarea><button class="save-answer-btn" data-save-answer="${i}">${a.recorded?'保存修正文字':'保存文字并继续'}</button></div>
    <div class="question-mini-tip"><strong>回答提示：</strong>${escapeHtml(topic.prompts[i]||'直接回答问题，并用原因、例子或建议展开。')}</div>
  </article>`;}).join('');
  $("#conversationProgressSummary").textContent=`已完成 ${answered} / ${topic.questions.length} 题。${answered===topic.questions.length?'整体反馈和完整参考答案已经开放。':'请按顺序继续回答。'}`;
  const current=topic.prompts[state.activeQuestionIndex]||topic.prompts[0]||'先听清楚问题，再直接回答。';$("#scaffoldText").textContent=current;updateSampleAnswerAccess();updateConversationSpeechButtons();
}
function allConversationQuestionsAnswered(){return state.conversationAnswers.length>0&&state.conversationAnswers.every(a=>a.recorded||normalizeChinese(a.text).length>=4);}
function nextUnansweredIndex(){const i=state.conversationAnswers.findIndex(a=>!a.recorded&&!normalizeChinese(a.text).length);return i<0?Math.max(0,state.conversationAnswers.length-1):i;}


function secureMicAvailable(){return window.isSecureContext||['localhost','127.0.0.1'].includes(location.hostname);}
function supportedMimeType(){const types=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];return types.find(t=>window.MediaRecorder?.isTypeSupported?.(t))||'';}
async function requestMicStream(){if(!secureMicAvailable())throw Object.assign(new Error('insecure'),{name:'SecurityError'});if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw Object.assign(new Error('unsupported'),{name:'NotSupportedError'});return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});}
function friendlyMicError(err){if(err?.name==='NotAllowedError'||err?.name==='PermissionDeniedError')return '麦克风权限未获允许。请点击地址栏旁的锁头或麦克风图标，改为“允许”，然后刷新页面。';if(err?.name==='NotFoundError'||err?.name==='DevicesNotFoundError')return '找不到可用的麦克风。请检查电脑或耳机的录音装置。';if(err?.name==='NotReadableError'||err?.name==='TrackStartError')return '麦克风可能正被另一个应用占用。请关闭其他会议或录音应用后再试。';if(err?.name==='SecurityError')return '浏览器只允许安全的 HTTPS 页面使用麦克风。请使用本页的线上测试链接。';if(err?.name==='NotSupportedError')return '这个浏览器不支持网页录音。请使用最新版 Microsoft Edge 或 Google Chrome。';return '无法开启麦克风。请刷新页面，并使用最新版 Edge 或 Chrome 再试。';}
async function testMicrophone(){
  const btn=$("#micTestBtn"),status=$("#micTestStatus"),player=$("#micTestPlayback");btn.disabled=true;btn.classList.add('testing');status.className='';status.textContent='正在请求麦克风权限……请在浏览器提示中选择“允许”。';let stream;
  try{stream=await requestMicStream();const chunks=[],mime=supportedMimeType();const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType||mime||'audio/webm'});if(player.src)URL.revokeObjectURL(player.src);player.src=URL.createObjectURL(blob);player.hidden=false;status.className='support-ok';status.textContent='麦克风测试完成。请播放录音，确认能听见自己的声音。';stream.getTracks().forEach(t=>t.stop());btn.disabled=false;btn.classList.remove('testing');btn.textContent='🎙️ 再测试一次';};recorder.start();let left=3;btn.textContent=`正在录音 ${left}…`;const tick=setInterval(()=>{left--;if(left>0)btn.textContent=`正在录音 ${left}…`;},1000);setTimeout(()=>{clearInterval(tick);if(recorder.state!=='inactive')recorder.stop();},3100);
  }catch(err){stream?.getTracks().forEach(t=>t.stop());const msg=friendlyMicError(err);status.className='support-error';if(status)status.textContent=msg;showToast(msg);renderConversationQuestions();btn.disabled=false;btn.classList.remove('testing');btn.textContent='🎙️ 测试麦克风（3秒）';}
}

async function startRecording(type,questionIndex=null){
  if(state.recordingType){await stopRecording();return;}stopSpeaking();const btn=type==='reading'?$('#readingRecordBtn'):$(`[data-record-question="${questionIndex}"]`),status=type==='reading'?$('#readingRecordStatus'):null;if(!btn)return;state.recordingQuestionIndex=type==='conversation'?questionIndex:null;btn.classList.add('requesting');if(status)status.textContent='正在请求麦克风权限……请在浏览器提示中选择“允许”。';else showToast(`正在准备第 ${questionIndex+1} 题录音，请允许麦克风。`);
  try{state.transcript='';state.interimTranscript='';state.audioChunks=[];state.seconds=0;state.mediaStream=await requestMicStream();state.recordingType=type;state.allowRecognitionRestart=true;const mime=supportedMimeType();state.mediaRecorder=mime?new MediaRecorder(state.mediaStream,{mimeType:mime}):new MediaRecorder(state.mediaStream);state.mediaRecorder.ondataavailable=e=>{if(e.data.size)state.audioChunks.push(e.data);};state.mediaRecorder.onstop=()=>finishAudio(type,state.recordingQuestionIndex);state.mediaRecorder.start(250);startSpeechRecognition(type);startTimer(type,state.recordingQuestionIndex);btn.classList.remove('requesting');btn.classList.add('recording');if(type==='reading'){$('#readingRecordBtnLabel').textContent='结束录音';$('#readingLiveDot').classList.add('active');$('#readingRecordingCard').classList.add('is-recording');$('#readingRecognitionState').textContent='正在识别';$('#readingRecognitionState').className='recognition-state active';$('#readingRecognitionHint').textContent='请自然朗读；文字会边读边出现。';}if(status)status.textContent='🔴 正在录音……再次点击“结束录音”';renderConversationQuestions();
  }catch(err){state.recordingType=null;state.allowRecognitionRestart=false;btn.classList.remove('requesting','recording');const msg=friendlyMicError(err);if(status)status.textContent=msg;showToast(msg);renderConversationQuestions();}
}
function startSpeechRecognition(type,languageIndex=0){
  if(!SpeechRecognition){showToast('浏览器可以录音，但不支持自动语音转文字。你可在录音后手动补上文字，再获取反馈。');return;}
  const languages=['zh-CN','zh-SG'];
  const rec=new SpeechRecognition();rec.lang=languages[Math.min(languageIndex,languages.length-1)];rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;
  rec.onstart=()=>{if(type==='reading'){const st=$('#readingRecognitionState');if(st){st.textContent=`正在识别（${rec.lang}）`;st.className='recognition-state active';}}};
  rec.onresult=(event)=>{let final='',interim='';for(let i=0;i<event.results.length;i++){const piece=event.results[i][0].transcript||'';if(event.results[i].isFinal)final+=piece;else interim+=piece;}if(final)state.transcript+=(state.transcript&& !/\s$/.test(state.transcript)?' ':'')+final;state.interimTranscript=interim;const live=(state.transcript+' '+state.interimTranscript).trim();if(type==='reading'){const editor=$('#readingTranscriptEditor');if(editor)editor.value=live;const st=$('#readingRecognitionState');if(st)st.textContent=live?'正在记录文字':'正在聆听';}else if(type==='conversation'){const editor=$(`[data-answer-editor="${state.recordingQuestionIndex}"]`);if(editor)editor.value=live;const answer=state.conversationAnswers[state.recordingQuestionIndex];if(answer)answer.text=live;}};
  rec.onnomatch=()=>{if(type==='reading')$('#readingRecognitionHint').textContent='暂时没有听清楚，请靠近麦克风并继续朗读。';};
  rec.onerror=e=>{if(['not-allowed','service-not-allowed'].includes(e.error)){state.allowRecognitionRestart=false;if(type==='reading'){$('#readingRecognitionState').textContent='无法自动识别';$('#readingRecognitionState').className='recognition-state warning';$('#readingRecognitionHint').textContent='录音仍会保存。可播放自评，或手动输入／修正文字后检查反馈。';}showToast('自动语音转文字未获允许。录音仍会保存，也可手动补上文字后获取反馈。');}else if(e.error==='language-not-supported'&&languageIndex<languages.length-1){state.allowRecognitionRestart=false;setTimeout(()=>{state.allowRecognitionRestart=true;startSpeechRecognition(type,languageIndex+1);},100);}else if(!['no-speech','aborted'].includes(e.error)){showToast('语音转文字暂时中断，系统会继续尝试。');}};
  rec.onend=()=>{if(state.allowRecognitionRestart&&state.recordingType===type){state.interimTranscript='';setTimeout(()=>startSpeechRecognition(type,languageIndex),120);}};
  try{rec.start();state.recognition=rec;}catch{if(languageIndex<languages.length-1)setTimeout(()=>startSpeechRecognition(type,languageIndex+1),120);}
}
async function stopRecording(){
  const type=state.recordingType;if(!type)return;const questionIndex=state.recordingQuestionIndex;state.allowRecognitionRestart=false;if(state.interimTranscript){state.transcript+=state.interimTranscript;state.interimTranscript='';}clearInterval(state.timerId);state.timerId=null;try{state.recognition?.stop();}catch{}state.recognition=null;if(state.mediaRecorder&&state.mediaRecorder.state!=='inactive')state.mediaRecorder.stop();state.mediaStream?.getTracks().forEach(t=>t.stop());state.mediaStream=null;const btn=type==='reading'?$("#readingRecordBtn"):$(`[data-record-question="${questionIndex}"]`);btn?.classList.remove('recording','requesting');state.recordingType=null;
  if(type==='reading'){$("#readingRecordBtnLabel").textContent='重新录音';$("#readingLiveDot").classList.remove('active');$("#readingRecordingCard").classList.remove('is-recording');$("#readingRecordStatus").textContent='录音完成，正在整理反馈……';$("#readingRecognitionState").textContent=state.transcript.trim()?'识别完成':'没有取得文字';$("#readingRecognitionState").className='recognition-state '+(state.transcript.trim()?'done':'warning');if(state.transcript.trim())$("#readingTranscriptEditor").value=state.transcript.trim();setTimeout(()=>evaluateReading(),700);}else{setTimeout(()=>completeConversationQuestion(questionIndex),700);}
}
function finishAudio(type,questionIndex=null){if(!state.audioChunks.length)return;const blob=new Blob(state.audioChunks,{type:state.mediaRecorder?.mimeType||'audio/webm'}),url=URL.createObjectURL(blob);if(type==='reading'){const player=$("#readingPlayback");if(player.src)URL.revokeObjectURL(player.src);player.src=url;player.hidden=false;}else if(questionIndex!==null&&state.conversationAnswers[questionIndex]){const old=state.conversationAnswers[questionIndex].audioUrl;if(old)URL.revokeObjectURL(old);state.conversationAnswers[questionIndex].audioUrl=url;state.conversationAnswers[questionIndex].recorded=true;renderConversationQuestions();}}
function startTimer(type,questionIndex=null){const el=type==='reading'?$("#readingTimer"):$(`#questionTimer-${questionIndex}`);if(el)el.textContent='00:00';state.timerId=setInterval(()=>{state.seconds++;const timer=type==='reading'?$("#readingTimer"):$(`#questionTimer-${questionIndex}`);if(timer)timer.textContent=formatTime(state.seconds);},1000);}
function formatTime(s){return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
function normalizeChinese(s){return(s||'').replace(/[\s，。！？、；：,.!?;:'"“”‘’（）()\-]/g,'');}

function evaluateReading(textOverride){
  const passage=readingData[state.grade][state.passageIndex],raw=(textOverride!==undefined?textOverride:state.transcript||$("#readingTranscriptEditor").value).trim(),transcript=normalizeChinese(raw),statuses={};
  const targetWords=passage.targetWords||[];
  if(!raw){renderPassageText(passage,{});$("#readingScore").textContent='--';$("#readingTranscript").textContent='录音已经保存，但浏览器没有产生可用的语音识别文字，因此系统暂时不能判断哪些词语可能漏读或发音不够清楚。';$("#wordFeedbackList").innerHTML=targetWords.map(word=>`<div class="word-feedback neutral"><span>?</span><div><strong>${escapeHtml(word)}</strong><small>点击听正确读音，再播放自己的录音进行比较</small></div><button class="listen-word" data-speak-word="${escapeHtml(word)}">🔊</button></div>`).join('');$("#readingOverall").innerHTML='<strong>你仍然完成了录音。</strong> 请先播放自己的朗读自我检查。若要获得重点词语检查，可在上方“系统识别到的朗读文字”中输入或修正文字，再点击“检查朗读反馈”。';$("#readingFeedback").classList.remove('hidden');$("#readingRecordStatus").textContent='录音已保存；等待可用的识别文字';$("#readingRecognitionHint").textContent='没有识别文字时，系统无法从音频本身判断发音。可手动输入浏览器应听到的内容再检查。';return;}
  const results=targetWords.map(word=>{const ok=transcript.includes(normalizeChinese(word));statuses[word]=ok?'correct':'wrong';return{word,ok};});renderPassageText(passage,statuses);const good=results.filter(r=>r.ok).length,score=targetWords.length?Math.round(good/targetWords.length*100):100;$("#readingScore").textContent=`${score}%`;$("#readingTranscript").textContent=raw;$("#readingTranscriptEditor").value=raw;$("#wordFeedbackList").innerHTML=results.map(r=>`<div class="word-feedback ${r.ok?'good':'needs-work'}"><span>${r.ok?'✓':'↻'}</span><div><strong>${escapeHtml(r.word)}</strong><small>${r.ok?'浏览器识别到这个重点词语':'系统没有识别到；可能漏读或发音不够清楚，请点击听读音并跟读'}</small></div><button class="listen-word" data-speak-word="${escapeHtml(r.word)}">🔊</button></div>`).join('');$("#readingOverall").innerHTML=score>=80?'<strong>整体不错！</strong> 重点词语大多被清楚识别。下一次可注意语速、停顿和语气。':score>=50?'<strong>继续努力！</strong> 点击红色词语听读音，每个词跟读两遍后再录一次。':'<strong>先慢后快。</strong> 先播放范读，把篇章分成几句练习，再完整朗读。';$("#readingFeedback").classList.remove('hidden');$("#readingRecordStatus").textContent='已完成本次朗读反馈';$("#readingRecognitionState").textContent='反馈已生成';$("#readingRecognitionState").className='recognition-state done';if(textOverride===undefined)markCompleted('reading',`${state.grade}-${state.passageIndex}`,passage.title,score);
}

const markerSets={看法:['我认为','我觉得','我感到','在我看来','我的看法','我赞成','我不赞成','我喜欢','我不喜欢'],原因:['因为','所以','原因','由于','这是因为'],解释:['如果','这样','因此','结果','影响','会使','会让','久而久之','不但','而且','否则','这说明','这表示'],经历:['例如','比如','举个例子','记得有一次','有一次','我曾经','我看过','我遇过','上次'],建议:['我建议','应该','可以','需要','如果我是','如果我在场','我会','最好','不妨']};
function requiredStepsFor(topic){const q=topic.questions.join('');return{看法:true,原因:/为什么|好处|理由|影响|重要/.test(q),解释:/为什么|影响|重要|后果|好处/.test(q),经历:/曾经|看过|参加过|说一说|谈一谈|你的/.test(q),建议:/怎么|怎样|如何|鼓励|可以|应该|建议|做/.test(q)};}
function analyzeConversation(raw,topic){const text=normalizeChinese(raw),length=text.length,hitCount=markers=>markers.filter(m=>text.includes(normalizeChinese(m))).length,relevantHits=topic.keywords.filter(k=>text.includes(normalizeChinese(k))).length,required=requiredStepsFor(topic),scores={看法:length>=25?(hitCount(markerSets.看法)?2:1):0,原因:hitCount(markerSets.原因)>=2?2:hitCount(markerSets.原因)?1:0,解释:hitCount(markerSets.解释)>=2?2:hitCount(markerSets.解释)?1:0,经历:hitCount(markerSets.经历)>=2?2:hitCount(markerSets.经历)?1:0,建议:hitCount(markerSets.建议)>=2?2:hitCount(markerSets.建议)?1:0};const missingRequired=Object.keys(required).filter(k=>required[k]&&scores[k]===0);const used=Object.values(scores).filter(v=>v>0).length;const complete=length>=70&&relevantHits>=1&&!missingRequired.length;return{raw,text,length,relevantHits,required,scores,missingRequired,used,complete};}
function rubricGuidance(label,score){const map={看法:['先直接回答问题，并说出你的看法或感受。','看法已经表达出来，可说得更明确。','看法清楚，听者容易掌握你的立场。'],原因:['加入“因为……所以……”说明理由。','已有原因，可再补充一个理由。','理由较充分，能支持你的看法。'],解释:['说一说这样做会有什么影响、结果或道理。','已经开始解释，可再深入说明后果。','解释较深入，能帮助听者理解。'],经历:['加入一次亲身经历或具体例子。','已有例子，可补充当时的感受或结果。','经历具体，使答案更生动。'],建议:['根据题目提出一个实际可行的做法。','已有建议，可说明由谁来做、怎样做。','建议具体，也较容易实行。']};return map[label][score];}
function rubricRow(label,score,required){if(!required&&score===0)return`<div class="optional"><span>—</span><p><strong>${label}</strong><small>${criterionFor(label)}<br>本题不一定需要，可按内容加入。</small></p></div>`;const cls=score===2?'pass':score===1?'partial':'retry',symbol=score===2?'✓':score===1?'△':'↻';return`<div class="${cls}"><span>${symbol}</span><p><strong>${label}</strong><small>${criterionFor(label)}<br>${rubricGuidance(label,score)}</small></p></div>`;}
function starterForStep(step){return{看法:'我认为……／我觉得……',原因:'我这样想是因为……，所以……',解释:'如果大家都……，可能会……',经历:'记得有一次……，当时……',建议:'我建议……可以……，因为……'}[step]||'我想补充的是……';}


function normalizeForIdea(s){return normalizeChinese(s).toLowerCase();}
function sampleIdeasForQuestion(topic,index){const segment=sampleSegments(topic)[index]||'',found=topic.keywords.filter(k=>normalizeForIdea(segment).includes(normalizeForIdea(k))).slice(0,5);const sentences=(segment.match(/[^。！？!?]+[。！？!?]?/g)||[]).map(s=>s.trim()).filter(Boolean);const excerpt=sentences.slice(0,2).join('').slice(0,150);return{segment,excerpt,keywords:found.length?found:topic.keywords.slice(index,index+4),prompt:topic.prompts[index]||''};}
function stepPriorityForQuestion(question){
  if(/怎么|怎样|如何|可以做什么|应该怎么|帮助|教导|鼓励/.test(question))return['建议','原因','解释'];
  if(/曾经|看过|参加过|分享|说一说|谈一谈|你的经历|你平时/.test(question))return['经历','看法','原因'];
  if(/为什么|重要|好处|影响|意义|理由/.test(question))return['原因','解释','看法'];
  if(/你觉得|你认为|你赞成|你喜欢|好吗|应不应该/.test(question))return['看法','原因','解释'];
  return['看法','原因','经历'];
}
function requiredStepsForQuestion(question){const priority=stepPriorityForQuestion(question);return Object.fromEntries(['看法','原因','解释','经历','建议'].map(k=>[k,priority.includes(k)]));}
function stepScoresForAnswer(text,question){const clean=normalizeChinese(text),required=requiredStepsForQuestion(question),scores={};for(const [step,markers] of Object.entries(markerSets)){const hits=markers.filter(m=>clean.includes(normalizeChinese(m))).length;scores[step]=hits>=2?2:hits?1:0;}if(clean.length>=18&&stepPriorityForQuestion(question).includes('看法')&&scores.看法===0)scores.看法=1;return{scores,required,priority:stepPriorityForQuestion(question)};}
function assessQuestionAnswer(topic,index,text){
  const clean=normalizeChinese(text),ideas=sampleIdeasForQuestion(topic,index),hits=ideas.keywords.filter(k=>clean.includes(normalizeChinese(k))),step=stepScoresForAnswer(text,topic.questions[index]);let level='retry',score=0;if(clean.length>=45&&(hits.length||Object.values(step.scores).filter(Boolean).length>=2)){level='pass';score=2;}else if(clean.length>=16){level='partial';score=1;}
  const strengths=step.priority.filter(k=>step.scores[k]>0).slice(0,1),missing=step.priority.filter(k=>step.scores[k]===0).slice(0,Math.max(1,3-strengths.length));
  let guidance;if(!clean){guidance='录音已保存，但没有取得识别文字。请先播放录音检查，再重新录音，或在文字框补上你刚才说的内容。';}else if(score===2){guidance=`你已经${strengths.length?criterionFor(strengths[0]):'清楚回应问题'}。下一步只需再补充${missing.length?'“'+missing.slice(0,2).join('”或“')+'”':'一个更具体的例子'}，不必把五个方向都说完。`;}else{guidance=`你已经开始回应问题。根据这道题，先加强${missing.length?'“'+missing.slice(0,2).join('”和“')+'”':'一个具体例子'}，让答案更完整。`;}
  const nextStep=missing[0]||step.priority.find(k=>step.scores[k]<2)||step.priority[0];return{level,score,length:clean.length,hits,ideas,guidance,stepScores:step.scores,required:step.required,priority:step.priority,strengths,missing,nextStep};
}
function completeConversationQuestion(index){if(index===null||index<0)return;const answer=state.conversationAnswers[index];answer.text=(state.transcript||$(`[data-answer-editor="${index}"]`)?.value||answer.text||'').trim();answer.seconds=state.seconds;answer.recorded=true;state.transcript='';state.interimTranscript='';state.recordingQuestionIndex=null;state.activeQuestionIndex=nextUnansweredIndex();renderConversationQuestions();if(allConversationQuestionsAnswered()){evaluateConversationSet();showToast('所有问题已录音，逐题反馈和完整参考答案已经开放。');}else{const next=nextUnansweredIndex();state.activeQuestionIndex=next;renderConversationQuestions();showToast(`第 ${index+1} 题录音已保存。请继续第 ${next+1} 题。`);setTimeout(()=>$(`[data-speak-question="${next}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),150);}}
function renderStepChips(assessment){const chips=[];for(const step of assessment.strengths||[])chips.push(`<span class="feedback-step-chip done">✓ ${step}</span>`);for(const step of assessment.missing||[])chips.push(`<span class="feedback-step-chip try">可再补 ${step}</span>`);return chips.slice(0,3).join('');}
function teacherPromptFor(assessment){const step=assessment.nextStep;return step==='看法'?'你对这件事最明确的看法或感受是什么？':step==='原因'?'你为什么这样想？请补充一个原因。':step==='解释'?'这样做会带来什么影响或结果？':step==='经历'?'你有亲身经历或具体例子吗？':'你建议谁采取什么做法？为什么？';}
function feedbackSpeechFor(topic,assessment,index){return`第${index+1}题反馈。${assessment.guidance}。老师会追问：${teacherPromptFor(assessment)}。可以参考答案中的方向：${assessment.ideas.excerpt||assessment.ideas.prompt||assessment.ideas.keywords.join('、')}。`;}
function renderQuestionFeedback(topic,assessments){
  $('#questionFeedbackList').innerHTML=assessments.map((a,i)=>`<div class="question-feedback ${a.level}"><div class="question-feedback-head"><div><span>${a.score===2?'✓':a.score===1?'△':'↻'}</span><strong>第 ${i+1} 题反馈</strong></div><button class="feedback-speak-one" data-speak-feedback="${i}">🔊 朗读</button></div><p>${escapeHtml(a.guidance)}</p><div class="feedback-step-row">${renderStepChips(a)}</div><div class="teacher-followup"><b>老师会追问：</b>${escapeHtml(teacherPromptFor(a))}</div>${a.ideas.excerpt?`<div class="sample-direction"><b>可参考答案的思考方向：</b>${escapeHtml(a.ideas.excerpt)}<small>请用自己的经历和语言回答，不必背诵。</small></div>`:''}</div>`).join('');
  $('#feedbackAudioBtn').classList.remove('hidden');state.feedbackSpeechText=assessments.map((a,i)=>feedbackSpeechFor(topic,a,i)).join(' ');
}
function evaluateConversationSet(){
  const topic=conversationTopics[state.topicIndex],assessments=state.conversationAnswers.map((a,i)=>assessQuestionAnswer(topic,i,a.text));renderQuestionFeedback(topic,assessments);$('#rubricFeedback').classList.add('hidden');$('#sampleInsightBox').classList.add('hidden');$('#conversationOverall').classList.add('hidden');$('#teacherCoach').classList.add('hidden');updateSampleAnswerAccess();
  const total=assessments.reduce((sum,a)=>sum+a.score,0),combined=state.conversationAnswers.map(a=>a.text).join(' '),score=Math.min(100,Math.round((total/(topic.questions.length*2))*70+Math.min(normalizeChinese(combined).length/180,1)*30));if(!state.conversationMarkedComplete){state.conversationMarkedComplete=true;markCompleted('conversation',state.topicIndex,topic.title,score);}else saveProgress();
}
function showCoachForQuestion(index,assessments=null){const topic=conversationTopics[state.topicIndex],assessment=assessments?.[index]||assessQuestionAnswer(topic,index,state.conversationAnswers[index]?.text||'');state.coachQuestionIndex=index;$("#coachQuestion").textContent=`建议再练第 ${index+1} 题：“${topic.questions[index]}”`;$("#coachStarter").textContent=`先补充“${assessment.nextStep}”：${assessment.ideas.prompt||starterForStep(assessment.nextStep)}${assessment.ideas.keywords.length?'；也可以谈到 '+assessment.ideas.keywords.join('、'):''}`;$("#answerCoachBtn").textContent=`🎙️ 重录第 ${index+1} 题`;$("#teacherCoach").classList.remove('hidden');}
function answerCoach(){state.activeQuestionIndex=state.coachQuestionIndex;renderConversationQuestions();setTimeout(()=>startRecording('conversation',state.coachQuestionIndex),120);}
function nextCoachPrompt(){const next=(state.coachQuestionIndex+1)%conversationTopics[state.topicIndex].questions.length;showCoachForQuestion(next);}


function markCompleted(type,id,title,score){const arr=state.progress[type];if(!arr.includes(id)){arr.push(id);state.progress.stars+=type==='reading'?5:8;showToast(`完成练习，获得 ${type==='reading'?5:8} 颗星！`);}{const now=new Date();state.progress.history.unshift({type,id,title,score,iso:now.toISOString(),date:now.toLocaleString('zh-SG',{dateStyle:'short',timeStyle:'short'})});}state.progress.history=state.progress.history.slice(0,40);saveProgress();if(type==='reading')renderPassageListOnly();else renderTopicPickerOnly();}
function renderPassageListOnly(){const passages=readingData[state.grade];$("#passageProgress").textContent=`${state.progress.reading.filter(id=>id.startsWith(state.grade+'-')).length} / ${passages.length}`;$$('#passageList button').forEach((b,i)=>b.classList.toggle('completed',state.progress.reading.includes(`${state.grade}-${i}`)));}
function renderTopicPickerOnly(){const current=state.topicIndex;$("#topicSelect").innerHTML=conversationTopics.map((t,i)=>`<option value="${i}" ${i===current?'selected':''}>${state.progress.conversation.includes(i)?'✓ ':''}${i+1}. ${escapeHtml(t.title)}（${escapeHtml(t.group)}）</option>`).join('');$("#topicCompletionHint").textContent=`已完成 ${state.progress.conversation.length} / ${conversationTopics.length} 个话题`;}
function renderProgress(){updateHeader();$("#progressStars").textContent=state.progress.stars||0;$("#progressReading").textContent=state.progress.reading.length;$("#progressConversation").textContent=state.progress.conversation.length;$("#progressHistory").innerHTML=state.progress.history.length?state.progress.history.map(h=>`<div class="history-item"><span>${h.type==='reading'?'📖':'💬'} ${escapeHtml(h.title)}</span><span>${h.score}% · ${escapeHtml(h.date)}</span></div>`).join(''):'<div class="history-empty">还没有练习记录。完成一次朗读或会话后，记录会出现在这里。</div>';}



$$('[data-nav]').forEach(el=>el.addEventListener('click',()=>navigate(el.dataset.nav)));
$("#mobileMenu").addEventListener('click',()=>$(".sidebar").classList.toggle('open'));
$("#studentName").value=state.progress.name||'';$("#studentClass").value=state.progress.className||'';
$("#activateProfileBtn").addEventListener('click',()=>activateProfile($("#studentName").value,$("#studentClass").value));
$("#loadSavedProfileBtn").addEventListener('click',()=>{const key=$("#savedProfileSelect").value,p=state.profiles[key];if(p)activateProfile(p.name,p.className);});
[$("#studentName"),$("#studentClass")].forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter')activateProfile($("#studentName").value,$("#studentClass").value);}));
$("#micTestBtn").addEventListener('click',testMicrophone);
$$('.grade-btn').forEach(b=>b.addEventListener('click',()=>{state.grade=b.dataset.grade;state.passageIndex=0;renderReading();}));
$("#passageList").addEventListener('click',e=>{const b=e.target.closest('[data-passage]');if(!b)return;state.passageIndex=Number(b.dataset.passage);renderReading();});
$("#playModelReading").addEventListener('click',()=>speak(readingData[state.grade][state.passageIndex].text,.82,{model:true,key:'model-reading'}));
[$("#passageText"),$("#targetWordChips")].forEach(container=>container.addEventListener('click',e=>{const b=e.target.closest('[data-speak-word]');if(b){speak(b.dataset.speakWord,.72,{key:`word-${b.dataset.speakWord}`});showToast(`请跟读两遍：${b.dataset.speakWord}`);}}));
$("#wordFeedbackList").addEventListener('click',e=>{const b=e.target.closest('[data-speak-word]');if(b)speak(b.dataset.speakWord,.72,{key:`word-${b.dataset.speakWord}`});});
$("#readingRecordBtn").addEventListener('click',()=>state.recordingType?stopRecording():startRecording('reading'));
$("#analyseReadingTextBtn").addEventListener('click',()=>evaluateReading($("#readingTranscriptEditor").value));
$("#prevPassage").addEventListener('click',()=>{state.passageIndex=Math.max(0,state.passageIndex-1);renderReading();});
$("#nextPassage").addEventListener('click',()=>{state.passageIndex=(state.passageIndex+1)%readingData[state.grade].length;renderReading();});
$("#topicSelect").addEventListener('change',e=>{state.topicIndex=Number(e.target.value);renderConversation({resetSession:true});});
$("#topicQuestionList").addEventListener('click',e=>{const speakBtn=e.target.closest('[data-speak-question]'),recordBtn=e.target.closest('[data-record-question]'),saveBtn=e.target.closest('[data-save-answer]');if(speakBtn){const i=Number(speakBtn.dataset.speakQuestion);speak(conversationTopics[state.topicIndex].questions[i],.82,{key:`question-${i}`});return;}if(recordBtn){const i=Number(recordBtn.dataset.recordQuestion);state.activeQuestionIndex=i;if(state.recordingType)stopRecording();else startRecording('conversation',i);return;}if(saveBtn){const i=Number(saveBtn.dataset.saveAnswer),editor=$(`[data-answer-editor="${i}"]`),text=(editor?.value||'').trim();state.conversationAnswers[i].text=text;if(!state.conversationAnswers[i].recorded&&text)state.conversationAnswers[i].recorded=true;if(!text){showToast('暂时没有识别文字。请重新录音，或在方格中补上你刚才说的内容。');editor?.focus();return;}state.activeQuestionIndex=nextUnansweredIndex();renderConversationQuestions();if(allConversationQuestionsAnswered())evaluateConversationSet();else showToast(`第 ${i+1} 题识别文字已保存。请继续下一题。`);}});
$("#newPromptBtn").addEventListener('click',()=>{const t=conversationTopics[state.topicIndex],current=$("#scaffoldText").textContent,idx=t.prompts.indexOf(current);$("#scaffoldText").textContent=t.prompts[(idx+1+t.prompts.length)%t.prompts.length];});
$("#sampleAnswerAudioBtn").addEventListener('click',()=>speak(conversationTopics[state.topicIndex].sample,.78,{key:'sample-answer'}));
$("#feedbackAudioBtn").addEventListener('click',()=>speak(state.feedbackSpeechText||'请先完成所有问题。',.82,{key:'all-feedback'}));
$("#questionFeedbackList").addEventListener('click',e=>{const b=e.target.closest('[data-speak-feedback]');if(!b)return;const i=Number(b.dataset.speakFeedback),topic=conversationTopics[state.topicIndex],assessment=assessQuestionAnswer(topic,i,state.conversationAnswers[i]?.text||'');speak(feedbackSpeechFor(topic,assessment,i),.82,{key:`feedback-${i}`});});
$("#topicQuestionList").addEventListener('input',e=>{const editor=e.target.closest('[data-answer-editor]');if(editor){const i=Number(editor.dataset.answerEditor);state.conversationAnswers[i].text=editor.value;}});
$("#answerCoachBtn")?.addEventListener('click',answerCoach);$("#nextCoachPromptBtn")?.addEventListener('click',nextCoachPrompt);$("#restartConversationBtn")?.addEventListener('click',()=>{resetConversationSession();renderConversation({resetSession:false});});
$("#prevTopic").addEventListener('click',()=>{state.topicIndex=Math.max(0,state.topicIndex-1);renderConversation({resetSession:true});});
$("#nextTopic").addEventListener('click',()=>{state.topicIndex=(state.topicIndex+1)%conversationTopics.length;renderConversation({resetSession:true});});
$("#resetProgress").addEventListener('click',()=>{if(state.activeProfileKey&&confirm(`确定要清除 ${state.progress.name}（${state.progress.className}）的练习记录吗？`)){state.progress=emptyProgress(state.progress.name,state.progress.className);saveProgress();renderReading();renderConversation({resetSession:true});renderProgress();showToast('这个学生档案的练习记录已清除。');}});
window.addEventListener('beforeunload',()=>{if(state.recordingType)stopRecording();stopSpeaking();cleanupConversationAudio();});

updateHeader();renderSavedProfiles();renderReading();renderConversation({resetSession:true});



// v8: in-app teacher progress dashboard
const TEACHER_DASHBOARD_SESSION_KEY = "teacherDashboardCodeV8";
let teacherDashboardProfiles = [];
let teacherDashboardCode = (()=>{try{return sessionStorage.getItem(TEACHER_DASHBOARD_SESSION_KEY)||"";}catch{return "";}})();
function teacherFmt(value){const d=new Date(value||0);return Number.isNaN(d.getTime())?"—":d.toLocaleString("zh-SG",{dateStyle:"short",timeStyle:"short"});}
function teacherLatestScore(profile){const h=[...(profile?.history||[])].sort((a,b)=>Date.parse(b?.iso||b?.date||0)-Date.parse(a?.iso||a?.date||0))[0];return h?`${Math.round(Number(h.score)||0)}%`:'—';}
function teacherReadingTotal(){return Object.values(readingData||{}).reduce((n,list)=>n+(Array.isArray(list)?list.length:0),0)||20;}
function teacherFilteredProfiles(){const q=( $("#teacherDashboardSearch")?.value||"").trim().toLocaleLowerCase("en-SG"),cls=$("#teacherDashboardClassFilter")?.value||"";return teacherDashboardProfiles.filter(p=>(!cls||p.className===cls)&&(!q||`${p.name} ${p.className}`.toLocaleLowerCase("en-SG").includes(q)));}
function teacherProgressCell(done,total){const count=Math.max(0,Number(done)||0),pct=Math.min(100,Math.round(count/Math.max(1,total)*100));return `<div class="teacher-progress-cell"><div class="teacher-progress-track"><div class="teacher-progress-fill" style="width:${pct}%"></div></div><span class="teacher-progress-count">${count} / ${total}</span></div>`;}
function renderTeacherClassFilter(){const select=$("#teacherDashboardClassFilter"),current=select.value,classes=[...new Set(teacherDashboardProfiles.map(p=>p.className).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-SG'));select.innerHTML='<option value="">所有班级</option>'+classes.map(c=>`<option value="${escapeHtml(c)}" ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('');}
function renderTeacherDashboard(){const list=teacherFilteredProfiles(),readingTotal=teacherReadingTotal(),oralTotal=conversationTopics.length;$("#teacherDashboardCount").textContent=`${list.length} 名学生`;$("#teacherDashboardRows").innerHTML=list.map(p=>{const index=teacherDashboardProfiles.indexOf(p);return `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.className)}</td><td>${teacherProgressCell(p.reading?.length,readingTotal)}</td><td>${teacherProgressCell(p.conversation?.length,oralTotal)}</td><td>${teacherLatestScore(p)}</td><td>${teacherFmt(p.lastAccessed)}</td><td><button class="teacher-view-student" data-teacher-view="${index}">查看</button></td></tr>`;}).join('');$("#teacherDashboardEmpty").classList.toggle('hidden',Boolean(list.length));}
function showTeacherStudentDetail(index){const p=teacherDashboardProfiles[index];if(!p)return;$("#teacherStudentName").textContent=`${p.name} · ${p.className}`;$("#teacherStudentStats").innerHTML=`<span>📖 朗读 ${p.reading?.length||0} / ${teacherReadingTotal()}</span><span>💬 口语 ${p.conversation?.length||0} / ${conversationTopics.length}</span><span>⭐ ${p.stars||0}</span><span>最后学习 ${teacherFmt(p.lastAccessed)}</span>`;$("#teacherStudentHistory").innerHTML=(p.history||[]).length?(p.history||[]).slice(0,12).map(h=>`<div class="history-item"><span>${h.type==='reading'?'📖':'💬'} ${escapeHtml(h.title)}</span><span>${Math.round(Number(h.score)||0)}% · ${escapeHtml(h.date||teacherFmt(h.iso))}</span></div>`).join(''):'<div class="history-empty">还没有练习记录。</div>';$("#teacherStudentDetail").classList.remove('hidden');$("#teacherStudentDetail").scrollIntoView({behavior:'smooth',block:'nearest'});}
function useLocalTeacherDashboard(message=''){teacherDashboardProfiles=Object.values(state.profiles||{}).sort((a,b)=>Date.parse(b.lastAccessed||0)-Date.parse(a.lastAccessed||0));renderTeacherClassFilter();renderTeacherDashboard();$("#teacherDashboardUpdated").textContent='当前显示这台设备上的档案';const notice=$("#teacherDashboardNotice");notice.textContent=message||'云端进度暂时无法读取；目前只显示这台设备上使用过的学生档案。';notice.classList.remove('hidden');$("#teacherDashboardLogin").classList.add('hidden');$("#teacherDashboardContent").classList.remove('hidden');}
async function loadTeacherDashboard(){teacherDashboardCode=($("#teacherDashboardCode")?.value||teacherDashboardCode).trim();const msg=$("#teacherDashboardLoginMessage");msg.textContent='正在读取学生进度……';try{const r=await fetch(CLOUD_PROGRESS_ENDPOINT,{headers:{'x-teacher-code':teacherDashboardCode}});if(!r.ok)throw new Error(r.status===401?'教师代码不正确。':'暂时无法读取云端进度。');const data=await r.json();teacherDashboardProfiles=data.profiles||[];try{sessionStorage.setItem(TEACHER_DASHBOARD_SESSION_KEY,teacherDashboardCode);}catch{}$("#teacherDashboardLogin").classList.add('hidden');$("#teacherDashboardContent").classList.remove('hidden');$("#teacherDashboardNotice").classList.add('hidden');$("#teacherDashboardUpdated").textContent=`最后更新：${teacherFmt(data.updatedAt)}`;renderTeacherClassFilter();renderTeacherDashboard();msg.textContent='';}catch(error){if(String(error?.message||'').includes('不正确')){try{sessionStorage.removeItem(TEACHER_DASHBOARD_SESSION_KEY);}catch{}teacherDashboardCode='';msg.textContent=error.message;$("#teacherDashboardCode").focus();}else{useLocalTeacherDashboard(error.message);}}}
function openTeacherDashboard(){const modal=$("#teacherDashboardModal");modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');document.body.classList.add('teacher-dashboard-body-lock');$("#teacherDashboardCode").value=teacherDashboardCode;if(teacherDashboardCode)loadTeacherDashboard();else setTimeout(()=>$("#teacherDashboardCode").focus(),50);}
function closeTeacherDashboard(){const modal=$("#teacherDashboardModal");modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');document.body.classList.remove('teacher-dashboard-body-lock');$("#teacherStudentDetail").classList.add('hidden');}
function exportTeacherDashboardCsv(){const rows=[['姓名','班级','朗读完成','口语完成','星星','最近成绩','最后学习'],...teacherFilteredProfiles().map(p=>[p.name,p.className,p.reading?.length||0,p.conversation?.length||0,p.stars||0,teacherLatestScore(p),p.lastAccessed||''])];const csv=rows.map(row=>row.map(v=>`"${String(v??'').replaceAll('\"','\"\"')}"`).join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.download='华文口语练习学生进度.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);}
$("#openTeacherDashboard")?.addEventListener('click',openTeacherDashboard);
$("#closeTeacherDashboard")?.addEventListener('click',closeTeacherDashboard);
$$('[data-close-teacher-dashboard]').forEach(el=>el.addEventListener('click',closeTeacherDashboard));
$("#loadTeacherDashboard")?.addEventListener('click',loadTeacherDashboard);
$("#teacherDashboardCode")?.addEventListener('keydown',e=>{if(e.key==='Enter')loadTeacherDashboard();});
$("#teacherDashboardSearch")?.addEventListener('input',renderTeacherDashboard);
$("#teacherDashboardClassFilter")?.addEventListener('change',renderTeacherDashboard);
$("#refreshTeacherDashboard")?.addEventListener('click',loadTeacherDashboard);
$("#exportTeacherDashboard")?.addEventListener('click',exportTeacherDashboardCsv);
$("#teacherDashboardRows")?.addEventListener('click',e=>{const b=e.target.closest('[data-teacher-view]');if(b)showTeacherStudentDetail(Number(b.dataset.teacherView));});
$("#closeTeacherStudentDetail")?.addEventListener('click',()=>$("#teacherStudentDetail").classList.add('hidden'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$("#teacherDashboardModal")?.classList.contains('hidden'))closeTeacherDashboard();});

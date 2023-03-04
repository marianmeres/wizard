"use strict";const e=e=>"function"==typeof e,t=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())};exports.createWizardStore=(r,a)=>{let{steps:o,context:n,preResetHook:s}={steps:[],context:{},preResetHook:()=>null,...a||{}};if(!Array.isArray(o)||o.length<2)throw new TypeError(`${r}: expecting array of at least 2 steps configs.`);const i=(e,t)=>"function"==typeof e[t]?e[t]:()=>!0;let c=0;const u=o.length-1;let l=[];o=o.map(((e,t)=>{const r=e.data||{};return l[t]=(e=>JSON.parse(JSON.stringify(e)))(r),{...e,label:e.label||`${t+1}`,data:r,context:n,validate:i(e,"validate"),preNextHook:i(e,"preNextHook"),prePreviousHook:i(e,"prePreviousHook"),preResetHook:i(e,"preResetHook"),error:null,index:t,isFirst:0===t,isLast:t===u}}));const p=(e,t)=>({total:e.length,steps:e,current:t}),d=((r=undefined,a=null)=>{const o=t=>e(a?.persist)&&a.persist(t);let n=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const a=r(e,(e=>{t(e),a()}));return a},unsubscribeAll:t=>e.delete(t)}})(),s=r;o(s);const i=()=>s,c=e=>{s!==e&&(s=e,o(s),n.publish("change",s))};return{set:c,get:i,update:e=>{t(e,"[update]"),c(e(i()))},subscribe:e=>(t(e,"[subscribe]"),e(s),n.subscribe("change",e))}})(p(o,c)),f=(e,t)=>d.set(p(e,t)),b=async(e=null)=>{if(x.isDone())return c;o[c].data={...l[c],...o[c].data||{},...e||{}},o[c].error=null,await o[c].preNextHook(o[c].data,{context:n,wizardStore:x,setCurrentStepData:e=>o[c].data=e});const t=await o[c].validate(o[c].data,{context:n,wizardStore:x});return!0===t?(c=Math.min(u,c+1),o[c].error=null):o[c].error={validate:t},f([...o],c),c},w=async()=>(await o[c].prePreviousHook(o[c].data,{context:n,wizardStore:x,setCurrentStepData:e=>o[c].data=e}),c=Math.max(0,c-1),f([...o],c),c),x={context:n,get:d.get,subscribe:d.subscribe,next:b,previous:w,reset:async()=>{for(let e=c;e>=0;e--)c=e,await o[c].preResetHook(o[c].data,{context:n,wizardStore:x,setCurrentStepData:e=>o[c].data=e});return await s({context:n,wizardStore:x}),l.forEach(((e,t)=>o[t].data=e)),f([...o],c),c},goto:async(e,t=[])=>{if(e<0||e>u)return`Invalid step index ${e}`;if(e!==c){if(e<c)for(let t=c;t>e;t--)await w();else for(let r=c;r<=e;r++)if(await b(t[r]),o[r].error)return r;return c}},isDone:()=>c===u};return x};
const e=e=>"function"==typeof e,t=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())},r=(r,a)=>{let{steps:n,context:o,preResetHook:s}={steps:[],context:{},preResetHook:()=>null,...a||{}};if(!Array.isArray(n)||n.length<2)throw new TypeError(`${r}: expecting array of at least 2 steps configs.`);const i=(e,t)=>"function"==typeof e[t]?e[t]:()=>!0;let c=0;const u=n.length-1;let l=[];n=n.map(((e,t)=>{const r=e.data||{};return l[t]=(e=>JSON.parse(JSON.stringify(e)))(r),{...e,label:e.label||`${t+1}`,data:r,context:o,validate:i(e,"validate"),preNextHook:i(e,"preNextHook"),prePreviousHook:i(e,"prePreviousHook"),preResetHook:i(e,"preResetHook"),error:null,index:t,isFirst:0===t,isLast:t===u}}));const p=(e,t)=>({steps:e,current:t,step:e[t],context:o}),d=((r=undefined,a=null)=>{const n=t=>e(a?.persist)&&a.persist(t);let o=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const a=r(e,(e=>{t(e),a()}));return a},unsubscribeAll:t=>e.delete(t)}})(),s=r;n(s);const i=()=>s,c=e=>{s!==e&&(s=e,n(s),o.publish("change",s))};return{set:c,get:i,update:e=>{t(e,"[update]"),c(e(i()))},subscribe:e=>(t(e,"[subscribe]"),e(s),o.subscribe("change",e))}})(p(n,c)),f=(e,t)=>d.set(p(e,t)),b=async(e=null)=>{if(x.isDone())return c;n[c].data={...l[c],...n[c].data||{},...e||{}},n[c].error=null,await n[c].preNextHook(n[c].data,{context:o,wizardStore:x,setCurrentStepData:e=>n[c].data=e});const t=await n[c].validate(n[c].data,{context:o,wizardStore:x});return!0===t?(c=Math.min(u,c+1),n[c].error=null):n[c].error={validate:t},f([...n],c),c},w=async()=>(await n[c].prePreviousHook(n[c].data,{context:o,wizardStore:x,setCurrentStepData:e=>n[c].data=e}),c=Math.max(0,c-1),f([...n],c),c),x={get:d.get,subscribe:d.subscribe,next:b,previous:w,reset:async()=>{for(let e=c;e>=0;e--)c=e,await n[c].preResetHook(n[c].data,{context:o,wizardStore:x,setCurrentStepData:e=>n[c].data=e});return await s({context:o,wizardStore:x}),l.forEach(((e,t)=>n[t].data=e)),f([...n],c),c},goto:async(e,t=[])=>{if(e<0||e>u)return`Invalid step index ${e}`;if(e!==c){if(e<c)for(let t=c;t>e;t--)await w();else for(let r=c;r<=e;r++)if(await b(t[r]),n[r].error)return r;return c}},isDone:()=>c===u};return x};export{r as createWizardStore};

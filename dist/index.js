const e=e=>"function"==typeof e,t=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())},r=(r,n)=>{let{steps:a,context:s,preReset:o,done:i}={steps:[],context:{},preReset:()=>null,done:()=>null,...n||{}};if(!Array.isArray(a)||a.length<2)throw new TypeError(`${r}: expecting array of at least 2 steps configs.`);const c=(e,t)=>"function"==typeof e[t]?e[t]:()=>!0;let u=0;const l=a.length-1;let p=[],d=[];const x=[],f=()=>({steps:a,step:a[u]}),b=(e=null)=>{if(!0===e)return h.set(f()),u;let{data:t,error:r,canGoNext:n}=e||{};n=!!n;let s=0;return Object.entries({data:t,error:r,canGoNext:n}).forEach((([e,t])=>{void 0!==t&&a[u][e]!==t&&(a[u][e]=t,s++)})),s&&h.set(f()),u},w=async(e=null)=>(a[u].data={...p[u],...a[u].data||{},...e||{}},a[u].error=null,await x[u].preNext(a[u].data,{context:s,wizard:y,set:b}),a[u].canGoNext?(u=Math.min(l,u+1),a[u].error=null):a[u].error||="Cannot proceed. Check your step state and/or `canGoNext` flag.",a[u].isLast&&await i({context:s,steps:a}),b(!0)),g=async()=>(await x[u].prePrevious(a[u].data,{context:s,wizard:y,set:b}),u=Math.max(0,u-1),b(!0));a=a.map(((e,t)=>{const r=e.data||{},n=void 0===e.canGoNext||!!e.canGoNext;return p[t]=(e=>JSON.parse(JSON.stringify(e)))(r),d[t]=n,x[t]={preNext:c(e,"preNext"),prePrevious:c(e,"prePrevious"),preReset:c(e,"preReset")},{...e,label:e.label||`${t+1}`,index:t,data:r,canGoNext:n,error:null,isFirst:0===t,isLast:t===l,set:b,next:w,previous:g}}));const h=((r=undefined,n=null)=>{const a=t=>e(n?.persist)&&n.persist(t);let s=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const n=r(e,(e=>{t(e),n()}));return n},unsubscribeAll:t=>e.delete(t)}})(),o=r;a(o);const i=()=>o,c=e=>{o!==e&&(o=e,a(o),s.publish("change",o))};return{set:c,get:i,update:e=>{t(e,"[update]"),c(e(i()))},subscribe:e=>(t(e,"[subscribe]"),e(o),s.subscribe("change",e))}})(f()),y={get:h.get,subscribe:h.subscribe,context:s,next:w,previous:g,reset:async()=>{for(let e=u;e>=0;e--)u=e,await x[u].preReset(a[u].data,{context:s,wizard:y,set:b});return await o({context:s,wizard:y}),p.forEach(((e,t)=>{a[t].data=e,a[t].error=null,a[t].canGoNext=d[t]})),b(!0),u},goto:async(e,t=[])=>{if(e<0||e>l)return`Invalid step index ${e}`;if(e!==u){if(e<u)for(let t=u;t>e;t--)await g();else for(let r=u;r<=e;r++)if(await w(t[r]),a[r].error)return r;return u}}};return y};export{r as createWizardStore};

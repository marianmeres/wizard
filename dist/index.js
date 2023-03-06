const e=e=>"function"==typeof e,t=(t,r="")=>{if(!e(t))throw new TypeError(`${r} Expecting function arg`.trim())},r=(r,n)=>{let{steps:s,context:a,preReset:o,done:i}={steps:[],context:{},preReset:()=>null,done:()=>null,...n||{}};if(!Array.isArray(s)||s.length<2)throw new TypeError(`${r}: expecting array of at least 2 steps configs.`);const c=(e,t)=>"function"==typeof e[t]?e[t]:()=>!0;let u=0;const l=s.length-1;let p=[],d=[];const x=[];let f=!1;const g=()=>({steps:s,step:s[u],inProgress:f}),b=(e=null)=>{if(!0===e)return y.set(g()),u;let{data:t,error:r,canGoNext:n}=e||{};void 0!==n&&(n=!!n);let a=0;return Object.entries({data:t,error:r,canGoNext:n}).forEach((([e,t])=>{void 0!==t&&s[u][e]!==t&&(s[u][e]=t,a++)})),void 0!==e.inProgress&&e.inProgress!==f&&(f=e.inProgress,a++),a&&y.set(g()),u},w=async(e=null)=>{s[u].data={...p[u],...s[u].data||{},...e||{}},s[u].error=null,b({inProgress:!0}),await x[u].preNext(s[u].data,{context:a,wizard:N,set:b});let t=!1;return s[u].canGoNext?(t=s[u].isLast,u=Math.min(l,u+1),s[u].error=null):s[u].error||=`Step (${u}): Cannot proceed. Check your step state and/or 'canGoNext' flag.`,t&&await i({context:a,steps:s}),b({inProgress:!1})},h=async()=>(await x[u].prePrevious(s[u].data,{context:a,wizard:N,set:b}),u=Math.max(0,u-1),b(!0));s=s.map(((e,t)=>{const r=e.data||{},n=void 0===e.canGoNext||!!e.canGoNext;return p[t]=(e=>JSON.parse(JSON.stringify(e)))(r),d[t]=n,x[t]={preNext:c(e,"preNext"),prePrevious:c(e,"prePrevious"),preReset:c(e,"preReset")},{...e,label:e.label||`${t+1}`,index:t,data:r,canGoNext:n,error:null,isFirst:0===t,isLast:t===l,set:b,next:w,previous:h}}));const y=((r=undefined,n=null)=>{const s=t=>e(n?.persist)&&n.persist(t);let a=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const n=r(e,(e=>{t(e),n()}));return n},unsubscribeAll:t=>e.delete(t)}})(),o=r;s(o);const i=()=>o,c=e=>{o!==e&&(o=e,s(o),a.publish("change",o))};return{set:c,get:i,update:e=>{t(e,"[update]"),c(e(i()))},subscribe:e=>(t(e,"[subscribe]"),e(o),a.subscribe("change",e))}})(g()),N={get:y.get,subscribe:y.subscribe,context:a,next:w,previous:h,reset:async()=>{for(let e=u;e>=0;e--)u=e,await x[u].preReset(s[u].data,{context:a,wizard:N,set:b});return await o({context:a,wizard:N}),p.forEach(((e,t)=>{s[t].data=e,s[t].error=null,s[t].canGoNext=d[t]})),b(!0),u},goto:async(e,t=[])=>{if(e<0||e>l)return`Invalid step index ${e}`;if(e!==u){if(e<u)for(let t=u;t>e;t--)await h();else for(let r=u;r<=e;r++)if(await w(t[r]),s[r].error)return r;return u}}};return N};export{r as createWizardStore};

!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).wizard={})}(this,(function(e){"use strict";const t=e=>"function"==typeof e,r=(e,r="")=>{if(!t(e))throw new TypeError(`${r} Expecting function arg`.trim())};e.createWizardStore=(e,n)=>{let{steps:o,context:a,preReset:s}={steps:[],context:{},preReset:()=>null,...n||{}};if(!Array.isArray(o)||o.length<2)throw new TypeError(`${e}: expecting array of at least 2 steps configs.`);const i=(e,t)=>"function"==typeof e[t]?e[t]:()=>!0;let c=0;const u=o.length-1;let l=[];const d=()=>({steps:o,step:o[c],context:a}),p=(e=null)=>{if(!0===e)return y.set(d()),c;let{data:t,error:r,canGoNext:n}=e||{},s=0;return void 0!==t&&o[c].data!==t&&(o[c].data=t,s++),void 0!==r&&o[c].error!==r&&(o[c].error=r,s++),n=!!n,void 0!==n&&o[c].canGoNext!==n&&(o[c].canGoNext=n,s++),void 0!==e?.context&&e.context!==a&&(a=e.context,s++),s&&y.set(d()),c},x=e=>p({data:e}),f=e=>p({error:e}),b=e=>p({context:e}),h=(e=!0)=>p({canGoNext:e}),g=async(e=null)=>N.isDone()?c:(o[c].data={...l[c],...o[c].data||{},...e||{}},o[c].error=null,await o[c].preNext(o[c].data,{context:a,wizard:N,setData:x,setError:f,setContext:b,setCanGoNext:h,touch:p}),o[c].canGoNext?(c=Math.min(u,c+1),o[c].error=null):o[c].error||="Cannot proceed. Check your step state and/or `canGoNext` flag.",p(!0)),w=async()=>(await o[c].prePrevious(o[c].data,{context:a,wizard:N,setData:x,setError:f,setContext:b,setCanGoNext:h,touch:p}),c=Math.max(0,c-1),p(!0));o=o.map(((e,t)=>{const r=e.data||{};return l[t]=(e=>JSON.parse(JSON.stringify(e)))(r),{...e,label:e.label||`${t+1}`,index:t,data:r,canGoNext:void 0===e.canGoNext||!!e.canGoNext,error:null,isFirst:0===t,isLast:t===u,preNext:i(e,"preNext"),prePrevious:i(e,"prePrevious"),preReset:i(e,"preReset"),setData:x,setError:f,setContext:b,setCanGoNext:h,touch:p,next:g,previous:w}}));const y=((e=undefined,n=null)=>{const o=e=>t(n?.persist)&&n.persist(e);let a=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const n=r(e,(e=>{t(e),n()}));return n},unsubscribeAll:t=>e.delete(t)}})(),s=e;o(s);const i=()=>s,c=e=>{s!==e&&(s=e,o(s),a.publish("change",s))};return{set:c,get:i,update:e=>{r(e,"[update]"),c(e(i()))},subscribe:e=>(r(e,"[subscribe]"),e(s),a.subscribe("change",e))}})(d()),N={get:y.get,subscribe:y.subscribe,next:g,previous:w,reset:async()=>{for(let e=c;e>=0;e--)c=e,await o[c].preReset(o[c].data,{context:a,wizard:N,setData:x,setError:f,setContext:b,setCanGoNext:h,touch:p});return await s({context:a,wizard:N}),l.forEach(((e,t)=>{o[t].data=e,o[t].error=null})),p(!0),c},goto:async(e,t=[])=>{if(e<0||e>u)return`Invalid step index ${e}`;if(e!==c){if(e<c)for(let t=c;t>e;t--)await w();else for(let r=c;r<=e;r++)if(await g(t[r]),o[r].error)return r;return c}},isDone:()=>c===u};return N}}));

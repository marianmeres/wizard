!function(e,t){"object"==typeof exports&&"undefined"!=typeof module?t(exports):"function"==typeof define&&define.amd?define(["exports"],t):t((e="undefined"!=typeof globalThis?globalThis:e||self).wizard={})}(this,(function(e){"use strict";const t=e=>"function"==typeof e,r=(e,r="")=>{if(!t(e))throw new TypeError(`${r} Expecting function arg`.trim())};e.createWizardStore=(e,n)=>{let{steps:s,context:o,preReset:a,onDone:i}={steps:[],context:{},preReset:()=>null,onDone:()=>null,...n||{}};if(!Array.isArray(s)||s.length<2)throw new TypeError(`${e}: expecting array of at least 2 steps configs.`);let c=!1;const l=(e,t)=>{const r="function"==typeof e[t]?e[t]:()=>!0;return async(e,{context:t,set:n,wizard:s})=>{c=!0;const o=await r(e,{context:t,set:n,wizard:s});return c=!1,o}};let u=0;const p=s.length-1;let d=[],f=[];const x=[];let g=!1;const w=()=>({steps:s,step:s[u],inProgress:g}),b=(e,t)=>{if(!0===t)return P.set(w()),e;let{data:r,error:n,canGoNext:o}=t||{};void 0!==o&&(o=!!o);let a=0;return Object.entries({data:r,error:n,canGoNext:o}).forEach((([t,r])=>{void 0!==r&&s[e][t]!==r&&(s[e][t]=r,a++)})),void 0!==t.inProgress&&t.inProgress!==g&&(g=t.inProgress,a++),a&&P.set(w()),e},h=(e=null)=>b(u,e),y=async(e=null)=>{s[u].data={...d[u],...s[u].data||{},...e||{}},s[u].error=null,h({inProgress:!0}),await x[u].preNext(s[u].data,{context:o,wizard:v,set:h});let t=!1;if(s[u].canGoNext){if(t=s[u].isLast,u=Math.min(p,u+1),s[u].error=null,t)try{await i({context:o,steps:s,wizard:v,set:h})}catch(e){s[u].error=e}}else s[u].error||=[`Step (${u}): Cannot proceed.`,"(Hint: check if the 'canGoNext' step prop is re/set correctly)"].join(" ");return h({inProgress:!1})},N=async()=>(h({inProgress:!0}),await x[u].prePrevious(s[u].data,{context:o,wizard:v,set:h}),u=Math.max(0,u-1),h({inProgress:!1}));s=s.map(((e,t)=>{const r=e.data||{},n=void 0===e.canGoNext||!!e.canGoNext;return d[t]=(e=>JSON.parse(JSON.stringify(e)))(r),f[t]=n,x[t]={preNext:l(e,"preNext"),prePrevious:l(e,"prePrevious"),preReset:l(e,"preReset")},{...e,label:e.label||`${t+1}`,index:t,data:r,canGoNext:n,error:null,isFirst:0===t,isLast:t===p,next:y,previous:N,set:(e=null)=>b(t,e)}}));const P=((e,n=null)=>{const s=e=>t(n?.persist)&&n.persist(e);let o=(()=>{const e=new Map,t=t=>(e.has(t)||e.set(t,new Set),e.get(t)),r=(e,r)=>{if("function"!=typeof r)throw new TypeError("Expecting callback function as second argument");return t(e).add(r),()=>t(e).delete(r)};return{publish:(e,r={})=>{t(e).forEach((e=>e(r)))},subscribe:r,subscribeOnce:(e,t)=>{const n=r(e,(e=>{t(e),n()}));return n},unsubscribeAll:t=>e.delete(t)}})(),a=e;s(a);const i=()=>a,c=e=>{a!==e&&(a=e,s(a),o.publish("change",a))};return{set:c,get:i,update:e=>{r(e,"[update]"),c(e(i()))},subscribe:e=>(r(e,"[subscribe]"),e(a),o.subscribe("change",e))}})(w()),v={get:P.get,subscribe:P.subscribe,context:o,next:y,previous:N,reset:async()=>{if(c)throw new TypeError('Cannot reset wizard state from inside of "pre" handlers.');h({inProgress:!0});for(let e=u;e>=0;e--)try{u=e,await x[e].preReset(s[e].data,{context:o,wizard:v,set:h})}catch(e){}return await a({context:o,wizard:v}),d.forEach(((e,t)=>{s[t].data=e,s[t].error=null,s[t].canGoNext=f[t]})),h({inProgress:!1}),u},goto:async(e,t=[])=>{if(e<0||e>p)return`Invalid step index ${e}`;if(e!==u){if(e<u)for(let t=u;t>e;t--)await N();else for(let r=u;r<=e;r++)if(await y(t[r]),s[r].error)return r;return u}},label:e};return v}}));

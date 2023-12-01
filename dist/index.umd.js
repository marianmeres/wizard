!function(e,r){"object"==typeof exports&&"undefined"!=typeof module?r(exports):"function"==typeof define&&define.amd?define(["exports"],r):r((e="undefined"!=typeof globalThis?globalThis:e||self).wizard={})}(this,(function(e){"use strict";const r=e=>"function"==typeof e,t=(e,t="")=>{if(!r(e))throw new TypeError(`${t} Expecting function arg`.trim())},o=e=>"function"==typeof e;e.createWizardStore=(e,n)=>{let{steps:s,context:i,preReset:a,onDone:c}={steps:[],context:{},preReset:()=>null,onDone:()=>null,...n||{}};if(!Array.isArray(s)||s.length<2)throw new TypeError(`${e}: expecting array of at least 2 steps configs.`);const l=(...e)=>{o(n.logger)&&n.logger.apply(n.logger,e)};let p=!1;const d=(e,r)=>{const t=o(e[r])?e[r]:()=>!0;return async(e,{context:r,set:o,wizard:n})=>{p=!0;try{await t(e,{context:r,set:o,wizard:n})}catch(e){throw e}finally{p=!1}}};let u=0;const f=s.length-1;let g=[],x=[];const w=[];let h=!1;const b=()=>({steps:s,step:s[u],inProgress:h}),y=(e,r)=>{if(l(`  _set(${e})`,r),!0===r)return v.set(b()),e;let{data:t,error:n,canGoNext:i}=r||{};void 0!==i&&(i=!!i);let a=0;return Object.entries({data:t,error:n,canGoNext:i}).forEach((([r,t])=>{void 0===t||s[e][r]===t&&!o(t)||(o(t)&&(t=t(s[e][r])),s[e][r]!==t&&(s[e][r]=t,a++))})),void 0!==r.inProgress&&r.inProgress!==h&&(h=r.inProgress,a++),a&&v.set(b()),e},N=(e=null)=>(l("set() ..."),y(u,e)),$=async(e=null)=>{l("next() ...",{current:u});const r=u;s[r].data={...g[r],...s[r].data||{},...e||{}},s[r].error=null,y(r,{inProgress:!0});try{await w[r].preNext(s[r].data,{context:i,wizard:P,set:N})}catch(e){s[r].error=e,l(`  error in next:preNext(${r})`,e.toString())}if(s[r].canGoNext||(s[r].error||=[`Step (${r}): Cannot proceed.`,"(Hint: check if the 'canGoNext' step prop is re/set correctly)"].join(" ")),!s[r].error&&s[r].isLast)try{await c({context:i,steps:s,wizard:P,set:N})}catch(e){s[r].error=e,l("  error in next:onDone()",{current:r},e.toString())}return y(r,{inProgress:!1}),s[r].error||(u=Math.min(f,u+1),l(`  ... incremented pointer to ${u}`),s[u].error=null),N(!0)},m=async()=>{l("previous() ...",{current:u});const e=u;y(e,{inProgress:!0});try{await w[e].prePrevious(s[e].data,{context:i,wizard:P,set:N})}catch(r){s[e].error=r,l("  error in previous()",{current:e},r.toString())}return y(e,{inProgress:!1}),u=Math.max(0,u-1),l(`  ... decremented pointer to ${u}`),N(!0)};s=s.map(((e,r)=>{const t=e.data||{},o=void 0===e.canGoNext||!!e.canGoNext;return g[r]=(e=>JSON.parse(JSON.stringify(e)))(t),x[r]=o,w[r]={preNext:d(e,"preNext"),prePrevious:d(e,"prePrevious"),preReset:d(e,"preReset")},{...e,label:e.label||`${r+1}`,index:r,data:t,canGoNext:o,error:null,isFirst:0===r,isLast:r===f,next:$,previous:m,set:(e=null)=>{l("step.set() ..."),y(r,e)}}}));const v=((e,o=null)=>{const n=e=>r(o?.persist)&&o.persist(e);let s=(()=>{const e=new Map,r=r=>(e.has(r)||e.set(r,new Set),e.get(r)),t=(e,t)=>{if("function"!=typeof t)throw new TypeError("Expecting callback function as second argument");return r(e).add(t),()=>r(e).delete(t)};return{publish:(e,t={})=>{r(e).forEach((e=>e(t)))},subscribe:t,subscribeOnce:(e,r)=>{const o=t(e,(e=>{r(e),o()}));return o},unsubscribeAll:r=>e.delete(r)}})(),i=e;n(i);const a=()=>i,c=e=>{i!==e&&(i=e,n(i),s.publish("change",i))};return{set:c,get:a,update:e=>{t(e,"[update]"),c(e(a()))},subscribe:e=>(t(e,"[subscribe]"),e(i),s.subscribe("change",e))}})(b()),P={get:v.get,subscribe:v.subscribe,context:i,next:$,previous:m,reset:async()=>{if(l("reset() ...",{current:u}),p)throw new TypeError('Cannot reset wizard state from inside of "pre" handlers.');for(let e=u;e>=0;e--)try{u=e,y(e,{inProgress:!0}),await w[e].preReset(s[e].data,{context:i,wizard:P,set:N})}catch(r){l(`  swallowed error inside reset loop (preReset(${e}))`,r.toString())}finally{y(e,{inProgress:!1})}try{await a({context:i,wizard:P})}catch(e){l("  swallowed error inside global preReset()",e.toString())}return g.forEach(((e,r)=>{s[r].data=e,s[r].error=null,s[r].canGoNext=x[r]})),N(!0)},goto:async(e,r=[],t=!0)=>{if(l(`goto(${e}) ...`,{current:u}),e<0||e>f)throw new RangeError(`Invalid step index ${e}`);if(e===u)return;let o,n;if(e<u){for(let r=u;r>e;r--)if(o=await m(),s[r].error){l(`  error detected in goto back loop (index ${r})`,s[r].error),n=r;break}}else for(let t=u;t<e;t++)if(o=await $(r[t]),s[t].error){l(`  error detected in goto forward loop (index ${t})`,s[t].error),n=t;break}if(t&&void 0!==n)throw new Error([`The 'goto(${e}, ...)' command did not succeed.`,`Check step[${n}]'s error.`].join(" "));return o},label:e,allowCanGoNext:()=>(s=s.map(((e,r)=>({...e,canGoNext:!0}))),N(!0)),resetCanGoNext:()=>(s=s.map(((e,r)=>({...e,canGoNext:x[r]}))),N(!0))};return P}}));

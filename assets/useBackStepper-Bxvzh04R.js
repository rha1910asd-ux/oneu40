import{c}from"./index-DimJZjcO.js";import{b as r}from"./react-DHfssxra.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["path",{d:"m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z",key:"9ktpf1"}],["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}]],m=c("compass",y);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]],_=c("log-out",d);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],g=c("pencil",f);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],R=c("rotate-ccw",h);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],L=c("triangle-alert",k);function x(u,i){const t=r.useRef(0),a=r.useRef(void 0),s=r.useRef(0),p=r.useRef(i);p.current=i,r.useEffect(()=>{const o=Math.max(0,u),e=window.history.state;for((e==null?void 0:e.key)!==a.current&&(a.current=e==null?void 0:e.key,t.current=(e==null?void 0:e.oneuStep)??0);t.current<o;){t.current+=1;try{window.history.pushState({...window.history.state??{},oneuStep:t.current},"")}catch{break}}if(t.current>o){const n=t.current-o;t.current=o,s.current+=1,window.history.go(-n)}},[u]),r.useEffect(()=>{const o=()=>{if(s.current>0){s.current-=1;return}const e=window.history.state,n=(e==null?void 0:e.oneuStep)??0;(e==null?void 0:e.key)===a.current&&n<t.current?(t.current=n,p.current()):(a.current=e==null?void 0:e.key,t.current=n)};return window.addEventListener("popstate",o),()=>window.removeEventListener("popstate",o)},[])}export{m as C,_ as L,g as P,R,L as T,x as u};

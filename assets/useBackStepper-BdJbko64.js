import{c as d}from"./index-BQT8klsB.js";import{b as s}from"./react-DHfssxra.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]],v=d("log-out",l);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],m=d("pencil",f);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],k=d("rotate-ccw",y);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],b=d("triangle-alert",p);function L(a,i={}){const t=i.blockTouch??!0;s.useEffect(()=>{if(!a)return;const r=n=>{n.cancelable&&n.preventDefault()};t&&document.addEventListener("touchmove",r,{passive:!1});const u=()=>{c.style.overflow=o,document.body.style.overflow=e};window.addEventListener("blur",u);const c=document.documentElement,o=c.style.overflow,e=document.body.style.overflow;return c.style.overflow="hidden",document.body.style.overflow="hidden",()=>{document.removeEventListener("touchmove",r),window.removeEventListener("blur",u),c.style.overflow=o,document.body.style.overflow=e}},[a,t])}function E(a,i){const t=s.useRef(0),r=s.useRef(void 0),u=s.useRef(0),c=s.useRef(i);c.current=i,s.useEffect(()=>{const o=Math.max(0,a),e=window.history.state;for((e==null?void 0:e.key)!==r.current&&(r.current=e==null?void 0:e.key,t.current=(e==null?void 0:e.oneuStep)??0);t.current<o;){t.current+=1;try{window.history.pushState({...window.history.state??{},oneuStep:t.current},"")}catch{break}}if(t.current>o){const n=t.current-o;t.current=o,u.current+=1,window.history.go(-n)}},[a]),s.useEffect(()=>{const o=()=>{if(u.current>0){u.current-=1;return}const e=window.history.state,n=(e==null?void 0:e.oneuStep)??0;(e==null?void 0:e.key)===r.current&&n<t.current?(t.current=n,c.current()):(r.current=e==null?void 0:e.key,t.current=n)};return window.addEventListener("popstate",o),()=>window.removeEventListener("popstate",o)},[])}export{v as L,m as P,k as R,b as T,L as a,E as u};

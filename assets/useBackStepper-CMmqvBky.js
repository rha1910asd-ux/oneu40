import{c as a}from"./index-BKIZO8Zd.js";import{b as o}from"./react-DHfssxra.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]],l=a("log-out",d);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],m=a("pencil",y);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],R=a("rotate-ccw",f);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],g=a("triangle-alert",h);function _(s,i){const t=o.useRef(0),c=o.useRef(void 0),u=o.useRef(0),p=o.useRef(i);p.current=i,o.useEffect(()=>{const n=Math.max(0,s),e=window.history.state;for((e==null?void 0:e.key)!==c.current&&(c.current=e==null?void 0:e.key,t.current=(e==null?void 0:e.oneuStep)??0);t.current<n;){t.current+=1;try{window.history.pushState({...window.history.state??{},oneuStep:t.current},"")}catch{break}}if(t.current>n){const r=t.current-n;t.current=n,u.current+=1,window.history.go(-r)}},[s]),o.useEffect(()=>{const n=()=>{if(u.current>0){u.current-=1;return}const e=window.history.state,r=(e==null?void 0:e.oneuStep)??0;(e==null?void 0:e.key)===c.current&&r<t.current?(t.current=r,p.current()):(c.current=e==null?void 0:e.key,t.current=r)};return window.addEventListener("popstate",n),()=>window.removeEventListener("popstate",n)},[])}export{l as L,m as P,R,g as T,_ as u};

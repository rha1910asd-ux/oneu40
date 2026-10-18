import{c as p}from"./index-BoRhIAyF.js";import{b as u}from"./react-C9chu8PC.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const l=[["path",{d:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4",key:"1uf3rs"}],["polyline",{points:"16 17 21 12 16 7",key:"1gabdz"}],["line",{x1:"21",x2:"9",y1:"12",y2:"12",key:"1uyos4"}]],g=p("log-out",l);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const f=[["path",{d:"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",key:"1a8usu"}],["path",{d:"m15 5 4 4",key:"1mk7zo"}]],v=p("pencil",f);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",key:"1357e3"}],["path",{d:"M3 3v5h5",key:"1xhq8a"}]],m=p("rotate-ccw",d);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]],b=p("triangle-alert",h),y=`url("data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.04 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>")}")`;function $(t,c=!1){const n=c?t?.36:.45:t?.38:.17;return`radial-gradient(circle at 50% 36%, transparent 38%, rgba(0,0,0,${n*.55}) 78%, rgba(0,0,0,${n}) 100%), ${y}`}function L(t,c=!1,n=!1){return c?[`inset 0 -5px 8px -3px rgba(0,0,0,${t?.4:.42})`,`0 3px 0 rgba(0,0,0,${t?.42:.28})`,`0 1.5px 2px rgba(0,0,0,${t?.4:.14})`,`0 12px 26px -10px rgba(0,0,0,${t?.6:.34})`].join(", "):n?[`inset 0 -2px 4px -2px rgba(0,0,0,${t?.22:.05})`,`0 1.5px 0 rgba(0,0,0,${t?.26:.06})`,`0 1px 1.5px rgba(0,0,0,${t?.25:.06})`].join(", "):[`inset 0 -4px 7px -3px rgba(0,0,0,${t?.38:.12})`,`0 2px 0 rgba(0,0,0,${t?.38:.09})`,`0 1px 1.5px rgba(0,0,0,${t?.35:.1})`,`0 8px 18px -7px rgba(0,0,0,${t?.65:.26})`].join(", ")}function R(t,c={}){const n=c.blockTouch??!0;u.useEffect(()=>{if(!t)return;const s=r=>{r.cancelable&&r.preventDefault()};n&&document.addEventListener("touchmove",s,{passive:!1});const i=()=>{a.style.overflow=o,document.body.style.overflow=e};window.addEventListener("blur",i);const a=document.documentElement,o=a.style.overflow,e=document.body.style.overflow;return a.style.overflow="hidden",document.body.style.overflow="hidden",()=>{document.removeEventListener("touchmove",s),window.removeEventListener("blur",i),a.style.overflow=o,document.body.style.overflow=e}},[t,n])}function E(t,c){const n=u.useRef(0),s=u.useRef(void 0),i=u.useRef(0),a=u.useRef(c);a.current=c,u.useEffect(()=>{const o=Math.max(0,t),e=window.history.state;for((e==null?void 0:e.key)!==s.current&&(s.current=e==null?void 0:e.key,n.current=(e==null?void 0:e.oneuStep)??0);n.current<o;){n.current+=1;try{window.history.pushState({...window.history.state??{},oneuStep:n.current},"")}catch{break}}if(n.current>o){const r=n.current-o;n.current=o,i.current+=1,window.history.go(-r)}},[t]),u.useEffect(()=>{const o=()=>{if(i.current>0){i.current-=1;return}const e=window.history.state,r=(e==null?void 0:e.oneuStep)??0;(e==null?void 0:e.key)===s.current&&r<n.current?(n.current=r,a.current()):(s.current=e==null?void 0:e.key,n.current=r)};return window.addEventListener("popstate",o),()=>window.removeEventListener("popstate",o)},[])}export{g as L,v as P,m as R,b as T,R as a,L as b,$ as n,E as u};

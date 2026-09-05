import{c as h}from"./index-DetB-rJx.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const m=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],w=h("file-text",m);/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M13.234 20.252 21 12.3",key:"1cbrk9"}],["path",{d:"m16 6-8.414 8.586a2 2 0 0 0 0 2.828 2 2 0 0 0 2.828 0l8.414-8.586a4 4 0 0 0 0-5.656 4 4 0 0 0-5.656 0l-8.415 8.585a6 6 0 1 0 8.486 8.486",key:"1pkts6"}]],y=h("paperclip",d),g=1600,u=.82;async function k(t){if(t.type==="image/gif"||t.size<300*1024)return t;try{const e=await createImageBitmap(t),c=Math.min(1,g/Math.max(e.width,e.height)),o=Math.round(e.width*c),r=Math.round(e.height*c),a=document.createElement("canvas");a.width=o,a.height=r;const s=a.getContext("2d");if(!s)return t;s.drawImage(e,0,0,o,r);const n=await new Promise(p=>a.toBlob(p,"image/jpeg",u));if(!n||n.size>=t.size)return t;const i=t.name.replace(/\.\w+$/,"")+".jpg";return new File([n],i,{type:"image/jpeg"})}catch{return t}}export{w as F,y as P,k as c};

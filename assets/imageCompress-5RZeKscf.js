import{c as m}from"./index-CGkT2fJN.js";/**
 * @license lucide-react v0.487.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const d=[["path",{d:"M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z",key:"1rqfz7"}],["path",{d:"M14 2v4a2 2 0 0 0 2 2h4",key:"tnqrlb"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],w=m("file-text",d),p=1600,g=.82;async function M(t){if(t.type==="image/gif"||t.size<300*1024)return t;try{const e=await createImageBitmap(t),c=Math.min(1,p/Math.max(e.width,e.height)),r=Math.round(e.width*c),o=Math.round(e.height*c),a=document.createElement("canvas");a.width=r,a.height=o;const h=a.getContext("2d");if(!h)return t;h.drawImage(e,0,0,r,o);const n=await new Promise(i=>a.toBlob(i,"image/jpeg",g));if(!n||n.size>=t.size)return t;const s=t.name.replace(/\.\w+$/,"")+".jpg";return new File([n],s,{type:"image/jpeg"})}catch{return t}}export{w as F,M as c};

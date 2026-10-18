import{j as e}from"./index-DdQvrCWt.js";import{b as c}from"./react-C9chu8PC.js";function u({src:a,top:s="0%",fadeTop:n=!1,opacity:o=1,objectPosition:r="50% 100%",backdropPosition:l,onFail:t}){const[m,d]=c.useState(!0);if(!m)return null;const i=()=>{d(!1),t==null||t()};return e.jsxs("div",{className:"absolute inset-0",style:{opacity:o,transition:"opacity 2.4s ease"},children:[e.jsx("style",{children:`
        .oneu-scene-img { position: absolute; left: 50%; transform: translateX(-50%); height: 100%; width: auto; min-width: 100%; max-width: none; object-fit: cover; }
        /* 가로가 그림보다 넓은 화면 — 그림은 높이에 맞추고, 양옆 경계를 부드럽게 */
        /* 넓은 화면에서 양옆을 채우는 흐린 배경 — 휴대폰(세로 화면)에선 가운데 그림에 완전히 가려 보이지도 않는데
           흐림을 계산해 버벅였다. 화면이 그림보다 넓을 때만 그린다. */
        .oneu-scene-backdrop { display: none; }
        @media (min-aspect-ratio: 1/2) {
          .oneu-scene-backdrop { display: block; }
          .oneu-scene-img { min-width: 0; -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 26%, #000 74%, transparent 100%); mask-image: linear-gradient(90deg, transparent 0, #000 26%, #000 74%, transparent 100%); }
        }
      `}),e.jsx("img",{src:a,alt:"","aria-hidden":"true",decoding:"async",draggable:!1,onError:i,className:"oneu-scene-backdrop",style:{position:"absolute",left:0,right:0,top:s,width:"100%",height:"100%",objectFit:"cover",objectPosition:l??r,filter:"blur(36px) brightness(1) saturate(1.05)",transform:"scale(1.12)",...n?{WebkitMaskImage:"linear-gradient(to bottom, transparent 0%, #000 9%)",maskImage:"linear-gradient(to bottom, transparent 0%, #000 9%)"}:{}}}),e.jsx("div",{className:"absolute inset-x-0 bottom-0",style:{top:s,...n?{WebkitMaskImage:"linear-gradient(to bottom, transparent 0%, #000 9%)",maskImage:"linear-gradient(to bottom, transparent 0%, #000 9%)"}:{}},children:e.jsx("img",{src:a,alt:"","aria-hidden":"true",decoding:"async",draggable:!1,onError:i,className:"oneu-scene-img",style:{objectPosition:r}})})]})}export{u as S};

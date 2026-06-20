"use client";

import Script from "next/script";

const KLAVIYO_COMPANY_ID = "U6Cjbt";
const KLAVIYO_SCRIPT_URL = `https://static.klaviyo.com/onsite/js/${KLAVIYO_COMPANY_ID}/klaviyo.js?company_id=${KLAVIYO_COMPANY_ID}`;

export function KlaviyoWidget() {
  return (
    <>
      <Script
        id="klaviyo-onsite"
        src={KLAVIYO_SCRIPT_URL}
        strategy="afterInteractive"
      />
      <Script id="klaviyo-init" strategy="afterInteractive">
        {`
          !function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise((function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))}));return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();
        `}
      </Script>
    </>
  );
}

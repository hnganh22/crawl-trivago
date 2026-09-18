
import {FingerprintGenerator} from "fingerprint-generator";
import {FingerprintInjector} from "fingerprint-injector";
import {chrome} from "playwright";
import {TYPE_HELPER} from '../utils/constants.js'


const getBrowserOptions=()=>{
   let options={headless: false }
   if(process.env.ENV==="prod"){
    switch(process.env.TYPE_HELPER){
      case TYPE_HELPER.VPN:
        options['proxy']={
          server : "socks5://localhost:16000"
        }
        break
      case TYPE_HELPER.PROXY:
        // options['proxy']={
        //   server: process.env.PROXY_SERVER,
        //   username: process.env.PROXY_USER,
        //   password: process.env.PROXY_PASSWORD,
        // }
        break
      default:
        break

    }
   }
   return options
}

export const getBrowser = async () => {
    const fingerprintGenerator = new FingerprintGenerator();
    const browserFingerprintWithHeaders = fingerprintGenerator.getFingerprint({
        devices: ['desktop'],
        browsers: ['chrome'],
    });

    const fingerprintInjector = new FingerprintInjector();
    const {fingerprint} = browserFingerprintWithHeaders;
    const options=getBrowserOptions()
    const browser = await chrome.launch(options);
    const context = await browser.newContext({
        userAgent: fingerprint.navigator.userAgent,
        locale: fingerprint.navigator.language,
        viewport: fingerprint.screen,
    });
    await fingerprintInjector.attachFingerprintToPlaywright(context, browserFingerprintWithHeaders);
    return browser
}
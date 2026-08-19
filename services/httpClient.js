import axios from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";

export const jar = new CookieJar();

export const httpClient = wrapper(
    axios.create({
        jar,
        withCredentials: true,
    }),
);

let warmedUp = false;

export async function warmUpSession(headers, timeout) {
    if (warmedUp) return;

    /*
     * Warm-up phải trông giống user mở tab mới vào homepage:
     * KHÔNG có Referer trỏ vào search/deal page cụ thể.
     */
    const { Referer: _r, ...homepageHeaders } = headers;

    await httpClient.get("https://www.trivago.com/", {
        headers: homepageHeaders,
        timeout,
    });

    warmedUp = true;
    console.log("[Trivago] Session warm-up xong, đã có cookie");
}

export function resetSession() {
    warmedUp = false;
}
export default {
	async fetch(request, env, ctx) {
        const headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type"
        };
        const paramsToObject = (entries) => {
            const result = {};
            for (const [key, value] of entries) {
                result[key] = value;
            };
            return result;
        };
        
        // https://uibakery.io/regex-library/url
        const urlRegex = /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&\/=]*)$/;
        const supportedURLRegexes = {
            dailymotion: /^https?:\/\/(?:www\.)?dailymotion\.com\/video\/[a-zA-Z0-9]+$/g,
            livestream: /^https?:\/\/(?:www\.)?livestream\.com\/accounts\/[0-9]+\/events\/[0-9]+$/g,
			netplus: /^https?:\/\/viamotionhsi\.netplus\.ch\/live\/eds\/.*\/browser-.*\/.*\..*$/g,
            arezzotv: /^https?:\/\/(?:www\.)?arezzotv\.it.*$/g,
            livetvuk: /^https?:\/\/(?:www\.)?livetvuk\.com\/yayin\/.*$/g
        };
        
        const vercelURLRegexes = {
            rai: /^https?:\/\/mediapolis.rai.it\/relinker\/relinkerServlet.htm\?cont=[0-9]{1,}$/g,
            babylon: /^https?:\/\/(?:www\.)?[a-zA-Z0-9]{1,}\.[a-z]{2,}\/video\/viewlivestreaming\?rel=[a-zA-Z0-9]+&cntr=0$/g
        };
    
        const requestURL = new URL(request.url);
        const specifiedURL = decodeURIComponent(requestURL.search.slice(1));
    
        let testResults = { matched: false, matchedRegex: "" };
        let vercelTestResults = { matched: false, matchedRegex: "" };
        let requestStatus;
        let response = "";
        let errorJSON = "";
        let errorStatus = 0;
    
        const testURL = (url) => {
            if (urlRegex.test(url)) {
                for (const regex in supportedURLRegexes) {
                    if (supportedURLRegexes[regex].test(url)) {
                        testResults = { matched: true, matchedRegex: regex };
                        break;
                    };
                };
            };
        };
    
        const testURLforVercel = (url) => {
            if (urlRegex.test(url)) {
                for (const regex in vercelURLRegexes) {
                    if (vercelURLRegexes[regex].test(url)) {
                        vercelTestResults = { matched: true, matchedRegex: regex };
                        break;
                    };
                };
            };
        };
    
        const returnErrorHeaders = (errorStatus) => {
            return {
                headers: {
                    ...headers,
                    "Content-Type": "application/json"
                },
                status: errorStatus
            };
        };
    
        if (request.method === "GET" && requestURL.pathname === "/api") {
            if (requestURL.search.length > 0) {
                testURL(specifiedURL);
                testURLforVercel(specifiedURL);
                if (vercelTestResults.matched) {
                    return new Response(JSON.stringify({
                        error: "Stai usando l'API Cloudflare, ma l'URL specificato richiede l'uso dell'API Vercel. Leggi di più su https://github.com/ZapprTV/cloudflare-api#readme.",
                        info: specifiedURL
                    }), returnErrorHeaders(400));
                } else if (testResults.matched) {
                    switch(testResults.matchedRegex) {
                        case "dailymotion":
                            await fetch(specifiedURL.replaceAll("/video/", "/player/metadata/video/"))
                                .then(response => response.json())
                                .then(async (json) => {
                                    await fetch(json.qualities.auto[0].url)
                                        .then(response => response.text())
                                        .then(playlist => {
                                            requestStatus = "hls";
                                            response = playlist;
                                        });
                                })
                                .catch(err => {
                                    requestStatus = false;
                                    errorJSON = JSON.stringify({
                                        error: "Impossibile recuperare l'URL della stream.",
                                        info: specifiedURL
                                    });
                                    errorStatus = 500;
                                });
                            break;

                        case "livestream":
                            await fetch(`https://player-api.new.livestream.com${new URL(specifiedURL).pathname}/stream_info`)
                                .then(response => response.json())
                                .then(async (json) => {
                                    await fetch(json.secure_m3u8_url)
                                        .then(response => response.url)
                                        .then(url => {
                                            requestStatus = "redirect";
                                            response = url;
                                        });
                                })
                                .catch(err => {
                                    requestStatus = false;
                                    errorJSON = JSON.stringify({
                                        error: "Impossibile recuperare l'URL della stream.",
                                        info: specifiedURL
                                    });
                                    errorStatus = 500;
                                });
                            break;

						case "netplus":
							await fetch(specifiedURL)
								.then(netplusResponse => {
									requestStatus = "redirect";
									response = netplusResponse.url;
								})
								.catch(err => {
                                    requestStatus = false;
                                    errorJSON = JSON.stringify({
                                        error: "Impossibile recuperare l'URL della stream.",
                                        info: specifiedURL
                                    });
                                    errorStatus = 500;
                                });
							break;

                        case "arezzotv":
                            var { parseHTML } = await import("linkedom");
                            await fetch(specifiedURL)
                                .then(response => response.text())
                                .then(html => {
                                    const youtubeEmbedURL = parseHTML(html).document.querySelector("iframe").src + "?autoplay=1&modestbranding=1&rel=0&hl=it-it";
                                    requestStatus = "redirect";
									response = youtubeEmbedURL;
                                })
                                .catch(err => {
                                    requestStatus = false;
                                    errorJSON = JSON.stringify({
                                        error: "Impossibile recuperare l'URL della stream.",
                                        info: specifiedURL
                                    });
                                    errorStatus = 500;
                                });
                            break;

                        case "livetvuk":
                            var { parseHTML } = await import("linkedom");
                            await fetch(specifiedURL, {
                                headers: {
                                    "Origin": "https://www.livetvuk.com",
                                    "Referer": "https://www.livetvuk.com/"
                                }
                            })
                                .then(response => response.text())
                                .then(html => {
                                    requestStatus = "redirect";
									response = parseHTML(html).document.querySelector("source").src.replaceAll(/&remote=no_check_ip.*/g, "");
                                })
                                .catch(err => {
                                    requestStatus = false;
                                    errorJSON = JSON.stringify({
                                        error: "Couldn't get the stream URL.",
                                        info: err.stack
                                    });
                                    errorStatus = 500;
                                });
                            break;
                    };
    
                    if (requestStatus === "redirect") {
                        return new Response(null, {
                            status: 302,
                            headers: {
                                ...headers,
                                "location": response
                            }
                        });
                    } else if (requestStatus === "hls") {
                        return new Response(response, {
                            status: 200,
                            headers: {
                                ...headers,
                                "Content-Type": "application/vnd.apple.mpegurl"
                            }
                        });
                    } else {
                        return new Response(errorJSON, returnErrorHeaders(errorStatus));
                    };
                } else {
                    return new Response(JSON.stringify({
                        error: "L'URL specificato non è valido, non è nel formato corretto oppure non è supportato dall'API di Zappr. Per vedere la lista di URL compatibili visita https://github.com/ZapprTV/cloudflare-api#readme.",
                        info: specifiedURL
                    }), returnErrorHeaders(400));
                }
            };
        } else if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: headers
            });
        } else {
            return new Response(JSON.stringify({
                error: "Metodo o endpoint invalido.",
                info: request.url
            }), returnErrorHeaders(405));
        }
	},
};

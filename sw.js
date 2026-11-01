/* লেজার অ্যাপের সার্ভিস ওয়ার্কার: ইন্টারনেট ছাড়াও অ্যাপ খোলার জন্য।
   আপডেট দিলে নিচের VERSION সংখ্যা বাড়ান (যেমন v2), তাহলে সবার ফোনে পুরোনো ক্যাশ মুছে নতুন ফাইল আসবে। */
const VERSION = 'ledger-shell-v1';
const RUNTIME = 'ledger-runtime-v1';
const SHELL = ['index-cloud.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'legal.html'];
const CDN_HOSTS = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];
const NAV_TIMEOUT = 4000;

self.addEventListener('install', e => {
    e.waitUntil((async () => {
        const c = await caches.open(VERSION);
        await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));   // একটা ফাইল না থাকলেও ইনস্টল আটকাবে না
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ইন্টারনেট নেই</title><body style="font-family:sans-serif;text-align:center;padding:40px"><h2>ইন্টারনেট নেই</h2><p>এই পাতা আগে একবারও খোলা হয়নি, তাই ইন্টারনেট ছাড়া খোলা যাচ্ছে না। ইন্টারনেট চালু করে আবার চেষ্টা করুন।</p></body>';

async function putSafe(cacheName, req, res) {
    try { if (res && (res.ok || res.type === 'opaque')) { const c = await caches.open(cacheName); await c.put(req, res.clone()); } } catch (e) {}
}

// পাতা (HTML): আগে নেট (নতুন সংস্করণ পেতে); ধীর বা না থাকলে ক্যাশ
async function handleNavigate(e) {
    const req = e.request, url = new URL(req.url), key = new Request(url.origin + url.pathname);
    const cache = await caches.open(VERSION);
    const net = fetch(req).then(res => { putSafe(VERSION, key, res); return res; });
    const cached = () => cache.match(key, { ignoreSearch: true });
    try {
        const res = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), NAV_TIMEOUT))]);
        return res;
    } catch (err) {
        const c = await cached();
        if (c) { e.waitUntil(net.catch(() => {})); return c; }   // ধীর হলে ক্যাশ দেখাই, পেছনে নতুনটা এনে রাখি
        try { return await net; } catch (e2) { return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }); }
    }
}

// স্ট্যাটিক ফাইল: ক্যাশ থেকে দ্রুত দেখাই, পেছনে নতুন করে আনি
async function handleStatic(e, cacheName) {
    const req = e.request, c = await caches.open(cacheName), hit = await c.match(req);
    const net = fetch(req).then(res => { putSafe(cacheName, req, res); return res; });
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
}

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === self.location.origin) {
        if (req.mode === 'navigate') { e.respondWith(handleNavigate(e)); return; }
        e.respondWith(handleStatic(e, VERSION));
        return;
    }
    // শুধু অনুমোদিত CDN; Firebase/Google API ও লগইনের অনুরোধ কখনো ছোঁয়া হয় না
    if (CDN_HOSTS.includes(url.hostname)) {
        if (url.hostname === 'www.gstatic.com' && !url.pathname.startsWith('/firebasejs/')) return;
        e.respondWith(handleStatic(e, RUNTIME));
    }
});

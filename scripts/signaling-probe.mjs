import { io } from "socket.io-client";

const URL = "http://localhost:81/?XTransformPort=3003";

function mkClient(label) {
  const s = io(URL, {
    transports: ["websocket", "polling"],
    forceNew: true,
    reconnection: false,
    timeout: 10000,
  });
  s.on("connect", () => console.log(`[${label}] connected`, s.id));
  s.on("disconnect", (reason) => console.log(`[${label}] DISCONNECT:`, reason));
  s.on("connect_error", (err) => console.log(`[${label}] CONNECT_ERROR:`, err?.message));
  return s;
}

const a = mkClient("A-host");
const code = "PRB123";

a.on("connect", () => {
  a.emit("channel:create", { code, fp: "AAAABBBBCCCCDDDDEEEE" }, (resp) => {
    console.log("[A] create ack:", JSON.stringify(resp));
    const b = mkClient("B-join");
    b.on("connect", () => {
      b.emit("channel:join", { code, fp: "FFFFEEEEDDDDCCCCBBBB" }, (resp2) => {
        console.log("[B] join ack:", JSON.stringify(resp2));
      });
    });
    a.on("peer-joined", (d) => console.log("[A] peer-joined:", JSON.stringify(d)));
    setTimeout(() => {
      a.emit("signal", { code, payload: { type: "offer", sdp: "probe" } }, (r3) =>
        console.log("[A] signal ack:", JSON.stringify(r3))
      );
      b.on("signal", (p) => console.log("[B] got signal:", JSON.stringify(p)));
    }, 500);
    setTimeout(() => {
      console.log("[probe] done — A connected:", a.connected, "B connected:", b.connected);
      process.exit(0);
    }, 3000);
  });
});

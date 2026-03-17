(()=>{
  globalThis.api={broadcastMessage:console.error}
  let _T=function*(){while(1){tick();yield}}()
  let T=()=>{_T.next()}
  setInterval(T,50)
})(); //use at start

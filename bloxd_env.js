(()=>{
  let _T=function*(){while(1){tick();yield}}()
  let T=()=>{_T.next()}
  setInterval(T,50)
})()

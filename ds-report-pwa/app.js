async function submitTest(){

alert("按鈕有觸發")

const data = {
date:"2026-03-09",
person:"測試",
site:"PWA",
work:"測試提交"
}

try{

const res = await fetch("你的AppsScriptURL",{
method:"POST",
body:JSON.stringify(data)
})

const result = await res.json()

alert("送出成功")

}catch(err){

console.error(err)
alert("送出失敗")

}

}

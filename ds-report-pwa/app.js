function submitTest(){
alert("按鈕有觸發")
const data = {
date:"2026-03-09",
person:"測試",
site:"PWA",
work:"測試提交"
}

fetch("https://script.google.com/macros/s/AKfycbzjwQZZn2nkko-WtLUSfY1_1xfgOXnESt6kQ-SMLlbFDthIowENSoXfrOhMH-dDCy7wPQ/exec",{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify(data)
})
.then(res=>res.json())
.then(result=>{
console.log(result)
alert("送出成功")
})
.catch(err=>{
console.error(err)
alert("送出失敗")
})

}


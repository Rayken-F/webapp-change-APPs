const API_URL =
"https://script.google.com/macros/s/AKfycbxjcr4dCeIvBV0rNZitR5VzZNFFwlCigJ1ugt01_BwtyaID5oi5AJSn9QVxDJXGSw56XA/exec

function submitDailyReport(data){

fetch(API_URL,{

method:"POST",

body:JSON.stringify(data)

})
.then(r=>r.json())
.then(res=>{

alert("送出成功")

})

}
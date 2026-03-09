const API_URL =
"https://script.google.com/macros/s/AKfycbzjwQZZn2nkko-WtLUSfY1_1xfgOXnESt6kQ-SMLlbFDthIowENSoXfrOhMH-dDCy7wPQ/exec"
  
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

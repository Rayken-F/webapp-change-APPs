const API_URL =
"https://script.google.com/macros/s/AKfycbzjwQZZn2nkko-WtLUSfY1_1xfgOXnESt6kQ-SMLlbFDthIowENSoXfrOhMH-dDCy7wPQ/exec";
  
function submitTest(){

fetch(API_URL,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
test:"Hello DS"
})
})
.then(r=>r.json())
.then(res=>{
console.log(res);
alert("成功");
})
.catch(err=>{
console.error(err);
});

}



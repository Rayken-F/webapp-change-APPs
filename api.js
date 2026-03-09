const API_URL =
"https://script.google.com/macros/s/AKfycbxjcr4dCeIvBV0rNZitR5VzZNFFwlCigJ1ugt01_BwtyaID5oi5AJSn9QVxDJXGSw56XA/exec

async function submitReport(data){

const res = await fetch(API_URL,{
method:"POST",
body:JSON.stringify(data)
});

return await res.json();

}
# Grinding WIP precise CTN status hotfix

Staging note only — production `index.html` / `api.js` are unchanged until backend validation passes.

Required UI messages:
- `CTN未建立IQC`
- `CTN已進入Grinding WIP`
- `CTN已入噴砂框`
- `CTN已經出站`
- `CTN已轉DCYL`
- `CTN已轉HT` (internal UI only)

Never use `CTN不在站內` or generic `已離開 Grinding` if an authoritative WIP state can be determined.

`TRANSFER_HT` is INTERNAL_ONLY and must not be exposed to the owner/customer API.

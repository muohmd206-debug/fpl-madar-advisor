import {buildSquad} from '/model.mjs';
self.onmessage=event=>{try{const squad=buildSquad(event.data.players,event.data.budget);self.postMessage({ids:squad.map(p=>p.id)});}catch(error){self.postMessage({error:error.message});}};

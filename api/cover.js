
export default async function handler(req,res){
  const {artist="",album=""}=req.query;
  if(!artist || !album) return res.status(400).json({error:"artist and album required"});
  try{
    const term=encodeURIComponent(`${artist} ${album}`);
    const url=`https://itunes.apple.com/search?term=${term}&entity=album&limit=8`;
    const r=await fetch(url,{headers:{"User-Agent":"AlbumOdyssey/1.0"}});
    if(!r.ok) throw new Error(`Apple ${r.status}`);
    const data=await r.json();
    const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
    const a=norm(artist), t=norm(album);
    let best=data.results.find(x=>norm(x.artistName)===a && norm(x.collectionName)===t)
      || data.results.find(x=>norm(x.artistName).includes(a) && norm(x.collectionName).includes(t))
      || data.results[0];
    if(!best?.artworkUrl100) return res.status(404).json({cover:null});
    const cover=best.artworkUrl100.replace(/100x100bb(?:-\d+)?\.jpg/,"600x600bb.jpg");
    res.setHeader("Cache-Control","s-maxage=2592000, stale-while-revalidate=86400");
    return res.status(200).json({cover,collectionName:best.collectionName,artistName:best.artistName});
  }catch(e){
    return res.status(500).json({error:e.message});
  }
}

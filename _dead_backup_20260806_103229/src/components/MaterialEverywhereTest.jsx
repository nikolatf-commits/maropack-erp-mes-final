
import React, { useState } from 'react';
import MaterialSelectorPRO, { MaterialText } from './MaterialSelectorPRO.jsx';

export default function MaterialEverywhereTest() {
  const [mat, setMat] = useState({});
  return (
    <div style={{padding:24}}>
      <h1>V46 Material Master Everywhere — Test</h1>
      <MaterialSelectorPRO value={mat} onChange={setMat} />
      <div style={{marginTop:20, padding:16, border:'1px solid #ddd', borderRadius:12}}>
        Prikaz u nalogu: <MaterialText material={mat} />
      </div>
      <pre style={{marginTop:20, background:'#f8fafc', padding:16}}>{JSON.stringify(mat, null, 2)}</pre>
    </div>
  );
}

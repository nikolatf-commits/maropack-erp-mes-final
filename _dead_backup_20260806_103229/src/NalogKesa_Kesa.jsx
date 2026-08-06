import React from "react";
import NalogLayoutPRO from "./NalogLayoutPRO.jsx";

// STANDARDIZOVANI A4 RADNI NALOG
// Stari veliki web prikazi su uklonjeni da ne bi ponovo prikazivali sve operacije na jednoj strani.
// Logika magacina/QR/istorije ostaje u Magacinu; ovaj fajl je samo print-ready prikaz naloga.
export default function NalogKesa_Kesa({ nalog = {} }) {
  return <NalogLayoutPRO nalog={{ ...nalog, naziv: nalog.naziv || "Nalog za kesu" }} activeTab="kesa" />;
}

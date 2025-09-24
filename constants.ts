
export const KNOWLEDGE_AREAS: { [key: string]: string[] } = {
  "Linguagens, Códigos e suas Tecnologias": [
    "Língua Portuguesa", "Literatura", "Língua Estrangeira (Inglês)", 
    "Língua Estrangeira (Espanhol)", "Artes", "Educação Física", 
    "Tecnologias da Informação e Comunicação"
  ],
  "Matemática e suas Tecnologias": ["Matemática"],
  "Ciências da Natureza e suas Tecnologias": ["Física", "Química", "Biologia"],
  "Ciências Humanas e Sociais Aplicadas": ["História", "Geografia", "Filosofia", "Sociologia"],
};

export const ALL_DISCIPLINES = Object.values(KNOWLEDGE_AREAS).flat();

export const DISCIPLINE_TO_AREA_MAP: { [key: string]: string } = {};
for (const area in KNOWLEDGE_AREAS) {
  KNOWLEDGE_AREAS[area].forEach(discipline => {
    DISCIPLINE_TO_AREA_MAP[discipline] = area;
  });
}

# Model Card — Detector de achados em radiografias panorâmicas

> Documento de registro das capacidades e limites do modelo de IA usado no OdontoScan AI.
> **Protótipo de pesquisa. Não é dispositivo médico validado. Não usar com pacientes reais.**

## 1. Identificação

| Campo | Valor |
|---|---|
| Modelo padrão | `liodon-ai/dental-panoramic-detector` |
| Arquivo | `backend/models/liodon_dental_panoramic.onnx` |
| Arquitetura | YOLO11-N (Ultralytics), export ONNX |
| Entrada | `1×3×640×640` (RGB, letterbox) |
| Saída | `1×7×8400` → 4 canais de caixa + **3 classes** |
| Tamanho | ~10,6 MB |
| Runtime | ONNX Runtime (CPU) via `OnnxDetector` |
| Licença dos pesos | **CC BY-NC-4.0 (não comercial)** |
| Motivo da escolha | Panorâmico nativo; cobre lesão periapical. Ver ADR-0002/0003. |
| Alternativa | `backend/models/dental_pathology_detector.onnx` (Apache-2.0, mas não generaliza para panorâmica) |

## 2. Classes detectadas

| id | Classe | O que abrange | Rótulo PT |
|---|---|---|---|
| 0 | `caries` | Cárie **e** cárie profunda (fundidas) | Cárie Dentária |
| 1 | `periapical_lesion` | Lesão periapical / periodontite apical | Lesão/Infecção Periapical |
| 2 | `impacted_tooth` | Dente impactado/incluso (inclui siso) | Dente Impactado/Incluso |

Os nomes são normalizados por **aliases** em `app/domain/clinical_rules.py` antes de resolver a conduta.

## 3. Uso pretendido

- **Pretendido:** apoio à decisão e comunicação com o paciente, sobre **radiografia panorâmica**,
  como **segunda opinião visual** em um protótipo de pesquisa.
- **Fora de escopo:** diagnóstico definitivo; uso com pacientes reais; outras modalidades
  (bitewing, periapical, intraoral, CBCT); medicão/quantificação; triagem autônoma.

## 4. Treino (conforme o card do dataset de origem)

| Fonte | Imagens | Caixas | Licença |
|---|---|---|---|
| DENTEX (MICCAI 2023) | 724 | 3.711 | CC BY 4.0 / NC-SA |
| OralXrays-9 (CVPR 2025) | 9.250 | 36.186 | Research use |
| **Total (train)** | **9.928** | **39.715** | — |

Validação: 46 imagens do subconjunto **val do DENTEX** (182 caixas).

**Distribuição de classes no treino (desbalanceada):**
`impacted_tooth` 57,0% · `caries` 31,2% · `periapical_lesion` 11,8%.

> O OralXrays-9 possui 9 classes (periodontite apical, cárie, siso, dente ausente, restauração,
> tratamento de canal, implante, coroa, ponte), mas apenas 3 foram mantidas neste detector —
> as demais (restaurações, implantes, etc.) foram **descartadas**.

## 5. Avaliação

| Fonte | Métrica | Valor |
|---|---|---|
| Card do modelo | mAP@50 no val do DENTEX | **0,622** |
| Nossa avaliação (6 imagens do val, IoU ≥ 0,5) | Precisão / Recall / F1 @ conf 0,40 | **0,545 / 0,480 / 0,511** |

Sweep de limiar realizado (nosso): F1 máximo em conf 0,35 (0,536); default do produto em
**conf 0,40** (P 0,545 / R 0,480), priorizando menos falsos positivos.

> **Amostra muito pequena (6 imagens).** Estes números servem para *calibrar* e para comparação
> relativa entre modelos, **não** como evidência de desempenho clínico.

## 6. Limitações (explícitas)

**Não detecta:**
- Perda óssea / periodontite (nível ósseo).
- Profundidade/severidade de cárie (rasa vs. profunda estão fundidas).
- Severidade/extensão de lesão periapical.
- Restaurações, implantes, coroas, tratamento de canal, pontes, dentes ausentes, raízes residuais.
- Cálculo (tártaro), fraturas, cistos, tumores, dentes supranumerários, reabsorção radicular,
  alterações de ATM/seios, apinhamento.
- Qualidade da imagem e qualquer medição quantitativa.

**Não faz:**
- Numeração FDI do dente (não identifica *qual* dente).
- Generalização para modalidades que não a panorâmica.
- Diagnóstico ou prescrição de conduta.

**Riscos conhecidos:**
- **Falsos positivos** (superdetecção, sobretudo em `impacted_tooth`).
- **Falsos negativos** — no nosso teste deixa passar ~metade das lesões anotadas (recall 0,48).
- **Viés de classe** decorrente do desbalanceamento do treino.
- Sensibilidade a variações de qualidade/exposição e a perturbações pequenas (robustez limitada).

## 6.1. Pré-processamento e filtros (medições nossas)

**Recorte automático da panorâmica — LIGADO (`AUTO_CROP_PANORAMA=true`).**
Detecta a faixa do exame por projeções de linha/coluna e remove cabeçalho, rodapé e recortes
intraorais ("quadros de laudo"). Efeito medido nas duas radiografias reais: em Gleiciane os
achados caíram de 3 → 2 (um era ruído do quadro) e, em Alessandra, uma detecção que estava
dentro de uma interproximal do rodapé deixou de ocorrer. As coordenadas continuam relativas à
imagem enviada (o recorte é desfeito no mapeamento).

**Supressão de material radiopaco — DESLIGADA (`SUPPRESS_RADIOPAQUE=false`).**
Hipótese: descartar caixas dominadas por pixels muito claros (restauração/implante/coroa)
reduziria falsos positivos em bocas tratadas. **Medição no val do DENTEX (6 imagens, IoU ≥ 0,5,
conf 0,40):**

| Filtro | TP | FP | FN | Precisão | Recall | F1 |
|---|---|---|---|---|---|---|
| desligado | 12 | 12 | 13 | 0,500 | **0,480** | **0,490** |
| ≥ 0,15 | 11 | 12 | 14 | 0,478 | 0,440 | 0,458 |
| ≥ 0,10 | 10 | 11 | 15 | 0,476 | **0,400** | 0,435 |

**Conclusão: o filtro remove mais verdadeiros positivos do que falsos positivos** — as caixas do
modelo são grandes e diluem o brilho da restauração com o osso ao redor. Ficou desligado por
padrão e mantido apenas para experimentação. Um filtro eficaz exigiria **caixas mais precisas**
(modelo melhor) ou um classificador de recorte em segundo estágio.

## 7. Conformidade e licenciamento

- **Não é SaMD regularizado.** Software de apoio diagnóstico tende à Classe II+ (ANVISA
  RDC 657/2022 e RDC 751/2022); o disclaimer **não** substitui notificação/registro.
- **Licença não comercial.** Os pesos são CC BY-NC-4.0 e os datasets públicos de origem
  (DENTEX, OralXrays-9) também são não comerciais. **Uso comercial exige** licenciar dados ou
  contratar uma API comercial (ex.: Overjet, Pearl, Diagnocat) atrás do mesmo `DetectorPort`.

## 8. Como trocar o modelo

1. Coloque o `.onnx` em `backend/models/`.
2. Ajuste `MODEL_PATH` (`.env` / `docker-compose.yml`).
3. Se o modelo não trouxer `names` no metadata, atualize `backend/models/labels.json`.

Nenhuma rota ou regra clínica precisa mudar (ADR-0003). Classe desconhecida cai no fallback
"Achado não catalogado" / `informativa`.

## 9. Referências

- DENTEX — Hamamci et al., MICCAI 2023 (`arxiv.org/abs/2305.19112`).
- OralXrays-9 — Chen et al., CVPR 2025.
- Modelo: `huggingface.co/liodon-ai/dental-panoramic-detector`.
- Dataset de treino combinado: `huggingface.co/datasets/liodon-ai/dental-panoramic-xray-yolo`.

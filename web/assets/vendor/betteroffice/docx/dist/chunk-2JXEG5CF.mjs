import {c,a,b}from'./chunk-VJFO26DF.mjs';import {f,g,h as h$1}from'./chunk-YITJ4QAO.mjs';import {b as b$1}from'./chunk-7WIUNGQW.mjs';var y={seed:"0".repeat(64),now:"2000-01-01T00:00:00.000Z"};function p(e,t){let r=JSON.stringify({...t,determinism:y}),i=e==="S10"?f(r):e==="S11"?g(r):h$1(r),n=JSON.parse(i);if(!n||typeof n!="object")throw new TypeError(`${e} Rust serializer returned a non-object response`);let s=n;if(s.wireVersion!==1||s.family!==t.family||typeof s.xml!="string")throw new TypeError(`invalid ${e} Rust serializer response for ${String(t.family)}`);return s.xml}function E(e){return p("S12",{family:"document",body:e.package.document})}function M(e){let t=p("S12",{family:"document",body:e}),r="<w:body>",i="</w:body>",n=t.indexOf(r),s=t.lastIndexOf(i);if(n<0||s<n)throw new Error("Rust document serializer omitted w:body");return t.slice(n+r.length,s)}function B(e){return p("S10",{family:"section",properties:e})}async function x(){let e=new Map;e.set("[Content_Types].xml",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`)),e.set("_rels/.rels",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`)),e.set("word/_rels/document.xml.rels",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)),e.set("word/document.xml",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r>
        <w:t></w:t>
      </w:r>
    </w:p>
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`)),e.set("word/styles.xml",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:sz w:val="22"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="200" w:line="276" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
  </w:style>
</w:styles>`));let t=new Date().toISOString();return e.set("docProps/core.xml",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>OpenOOXML DOCX Editor</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${t}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${t}</dcterms:modified>
</cp:coreProperties>`)),e.set("docProps/app.xml",a(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>OpenOOXML DOCX Editor</Application>
  <AppVersion>1.0.0</AppVersion>
</Properties>`)),b(e)}async function w(e,t={}){return (await h(e,t)).buffer}async function h(e,t={}){if(!e.originalBuffer)throw new Error("Cannot repack document: no original buffer for round-trip. Use createDocx() for new documents.");let r=await c(e,e.originalBuffer,t);return {buffer:r.buffer,warnings:r.warnings}}function T(e){return new Map(Object.entries(b$1(new Uint8Array(e))))}async function _(e,t,r={}){return P(T(e),t,r)}async function P(e,t,r={}){for(let[i,n]of t)e.set(i,a(n));return b(e)}async function $(e){let t=await x();return w({...e,originalBuffer:t})}export{E as a,M as b,B as c,w as d,h as e,_ as f,$ as g};
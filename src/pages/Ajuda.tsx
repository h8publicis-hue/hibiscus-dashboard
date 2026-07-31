export default function Ajuda() {
  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      <iframe
        src="/treinamento.html"
        title="Guia de Treinamento"
        className="flex-1 w-full border-0"
        style={{ minHeight: 0 }}
      />
    </div>
  );
}

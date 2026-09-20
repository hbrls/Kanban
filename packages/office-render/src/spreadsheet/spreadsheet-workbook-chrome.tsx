"use client";

export function SpreadsheetWorkbookBar({ title }: { title: string }) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "#ffffff",
        borderBottomColor: "#dadce0",
        borderBottomStyle: "solid",
        borderBottomWidth: 1,
        display: "flex",
        gap: 12,
        minHeight: 54,
        padding: "0 18px",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          alignItems: "center",
          background: "#12b76a",
          borderRadius: 8,
          color: "#ffffff",
          display: "grid",
          flex: "0 0 auto",
          height: 32,
          justifyContent: "center",
          width: 32,
        }}
      >
        <span
          style={{
            backgroundImage: "linear-gradient(#ffffff 0 0), linear-gradient(#ffffff 0 0)",
            backgroundPosition: "center, center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "1px 18px, 18px 1px",
            borderColor: "#ffffff",
            borderRadius: 3,
            borderStyle: "solid",
            borderWidth: 1.5,
            height: 18,
            width: 18,
          }}
        />
      </div>
      <div
        style={{
          color: "#202124",
          fontSize: 17,
          fontWeight: 600,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
    </div>
  );
}

export function SpreadsheetFormulaBar({
  address,
  value,
}: {
  address: string;
  value: string;
}) {
  return (
    <div
      style={{
        alignItems: "center",
        background: "#f8f9fa",
        borderBottomColor: "#dadce0",
        borderBottomStyle: "solid",
        borderBottomWidth: 1,
        display: "grid",
        gap: 8,
        gridTemplateColumns: "72px minmax(160px, 1fr)",
        minHeight: 42,
        padding: "6px 12px",
      }}
    >
      <div
        style={{
          color: "#5f6368",
          fontSize: 13,
          paddingLeft: 2,
        }}
      >
        {address}
      </div>
      <div
        style={{
          background: "#ffffff",
          borderColor: "#dadce0",
          borderRadius: 4,
          borderStyle: "solid",
          borderWidth: 1,
          color: "#5f6368",
          fontSize: 13,
          minHeight: 28,
          overflow: "hidden",
          padding: "5px 9px",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

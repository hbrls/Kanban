import type {ReactElement} from "react";

export function InlineMarkdown({ text }: { text: string }) {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/);
    return (
        <>
            {parts.map((part, j) => {
                if (part.startsWith("**") && part.endsWith("**")) {
                    return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
                }
                if (part.startsWith("`") && part.endsWith("`")) {
                    return <code key={j} className="px-1 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-xs font-mono">{part.slice(1, -1)}</code>;
                }
                return <span key={j}>{part}</span>;
            })}
        </>
    );
}


export function FormattedContent({content}: { content: string }) {
    const lines = content.split("\n");
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang = "";
    const elements: ReactElement[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith("```")) {
            if (!inCodeBlock) {
                inCodeBlock = true;
                codeBlockLang = line.slice(3).trim();
                codeBlockLines = [];
                continue;
            } else {
                inCodeBlock = false;
                elements.push(
                    <div key={i}
                         className="my-2 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800">
                        {codeBlockLang && (
                            <div
                                className="px-3 py-1 bg-slate-50 dark:bg-[#161922] text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                                {codeBlockLang}
                            </div>
                        )}
                        <pre className="px-3 py-2 text-xs font-mono overflow-x-auto bg-slate-50 dark:bg-[#0d0f17]">
              {codeBlockLines.join("\n")}
            </pre>
                    </div>
                );
                continue;
            }
        }
        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }
        if (line.startsWith("### ")) {
            elements.push(<div key={i} className="font-semibold mt-2 text-sm">{line.slice(4)}</div>);
            continue;
        }
        if (line.startsWith("## ")) {
            elements.push(<div key={i} className="font-bold mt-2">{line.slice(3)}</div>);
            continue;
        }
        if (line.startsWith("# ")) {
            elements.push(<div key={i} className="font-bold mt-2 text-lg">{line.slice(2)}</div>);
            continue;
        }
        if (line.startsWith("- ") || line.startsWith("* ")) {
            elements.push(
                <div key={i} className="pl-3 flex gap-1.5">
                    <span className="text-slate-400 shrink-0">&bull;</span>
                    <span><InlineMarkdown text={line.slice(2)}/></span>
                </div>
            );
            continue;
        }
        const numberedMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (numberedMatch) {
            elements.push(
                <div key={i} className="pl-3 flex gap-1.5">
                    <span className="text-slate-400 shrink-0">{numberedMatch[1]}.</span>
                    <span><InlineMarkdown text={numberedMatch[2]}/></span>
                </div>
            );
            continue;
        }
        if (line.startsWith("> ")) {
            elements.push(
                <div key={i}
                     className="pl-3 border-l-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 italic">
                    <InlineMarkdown text={line.slice(2)}/>
                </div>
            );
            continue;
        }
        if (line.trim() === "") {
            elements.push(<div key={i} className="h-1"/>);
            continue;
        }
        elements.push(<div key={i}><InlineMarkdown text={line}/></div>);
    }

    if (inCodeBlock && codeBlockLines.length > 0) {
        elements.push(
            <div key="unclosed-code"
                 className="my-2 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800">
                {codeBlockLang && (
                    <div
                        className="px-3 py-1 bg-slate-50 dark:bg-[#161922] text-[10px] text-slate-400 border-b border-slate-100 dark:border-slate-800">
                        {codeBlockLang}
                    </div>
                )}
                <pre className="px-3 py-2 text-xs font-mono overflow-x-auto bg-slate-50 dark:bg-[#0d0f17]">
          {codeBlockLines.join("\n")}
        </pre>
            </div>
        );
    }

    return <div className="space-y-1">{elements}</div>;
}
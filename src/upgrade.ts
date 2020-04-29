import createVHost, { VHost } from 'ts-ez-host';
import {
    CompilerOptions,
    createProgram,
    formatting,
    getDefaultCompilerOptions,
    getDefaultFormatCodeSettings,
    IScriptSnapshot,
    Program,
    textChanges
} from 'typescript';
import { ProxyChangesTracker } from './changes';
import { TypeScriptVersion } from './types';
import { visit } from './visitor';

class VLSHost extends VHost {
    getCompilationSettings(): CompilerOptions {
        return getDefaultCompilerOptions();
    }
    getScriptFileNames(): string[] {
        return [];
    }
    getScriptVersion(): string {
        return 'v3.8.3';
    }
    getScriptSnapshot(): IScriptSnapshot | undefined {
        return undefined;
    }
    writeFile(filename: string, content: string) {
        return super.writeFile(filename, content, false);
    }
}

export function upgrade(code: string, target: TypeScriptVersion) {
    const filename = 'dummy.ts';
    const options = getDefaultCompilerOptions();
    const host = createVHost();
    const vlsHost = new VLSHost();

    host.writeFile(filename, code, false);

    const formatCodeSettings = getDefaultFormatCodeSettings();
    const formatContext = formatting.getFormatContext(formatCodeSettings);

    let i = 0;
    let text = '';
    let lastProgram: Program | undefined = undefined;
    let needAnotherPass = true;
    while (needAnotherPass) {
        const program = (lastProgram = createProgram(
            [filename],
            options,
            host,
            lastProgram
        ));
        const checker = program.getTypeChecker();

        const sourceFile = program.getSourceFile(filename)!;
        text = sourceFile.getText();
        const changes = textChanges.ChangeTracker.with(
            {
                formatContext,
                host: vlsHost,
                preferences: {}
            },
            (changeTracker) => {
                const proxyChangeTracker = new ProxyChangesTracker(
                    changeTracker
                );
                visit(sourceFile, checker, proxyChangeTracker, target);
                needAnotherPass = proxyChangeTracker.needAnotherPass();
            }
        );

        changes.forEach((change) => {
            text = textChanges.applyChanges(text, change.textChanges);
        });
        host.writeFile(filename, text, false);

        console.log('pass', i++);
    }

    return text;
}

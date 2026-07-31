import { describe, it, expect } from "vitest";
import { detectLanguage } from "@/services/languageDetector";

describe("Language Detection Service", () => {
  it("detects HTML code", () => {
    const code = '<!DOCTYPE html><html><head><title>Test</title></head><body><div class="main">Hello</div></body></html>';
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("html");
    expect(result.confidence).toBeGreaterThanOrEqual(0.35);
  });

  it("detects Java code", () => {
    const code = `
import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("java");
  });

  it("detects C++ code", () => {
    const code = `
#include <iostream>
using namespace std;
int main() {
    cout << "Hello C++" << endl;
    return 0;
}`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("cpp");
  });

  it("detects C code", () => {
    const code = `
#include <stdio.h>
#include <stdlib.h>
int main() {
    printf("Hello C\\n");
    return 0;
}`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("c");
  });

  it("detects Python code", () => {
    const code = `
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

if __name__ == '__main__':
    print(fibonacci(10))
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("python");
  });

  it("detects TypeScript code", () => {
    const code = `
interface UserProfile {
  id: number;
  name: string;
  role: "admin" | "student";
}
export type UserResponse = Record<string, UserProfile>;
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("typescript");
  });

  it("detects JavaScript code", () => {
    const code = `
const items = [1, 2, 3];
console.log(items.map(x => x * 2));
document.getElementById("app").addEventListener("click", () => {});
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("javascript");
  });

  it("detects Go code", () => {
    const code = `
package main
import "fmt"
func main() {
    fmt.Println("Hello Go")
}
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("go");
  });

  it("detects SQL queries", () => {
    const code = `
SELECT id, name, score FROM students
WHERE score > 80
ORDER BY score DESC;
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("sql");
  });

  it("detects PHP code", () => {
    const code = `<?php
$greeting = "Hello PHP";
echo $greeting;
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("php");
  });

  it("detects Ruby code", () => {
    const code = `
def greet(name)
  puts "Hello #{name}"
end
attr_accessor :title
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("ruby");
  });

  it("detects Bash scripts", () => {
    const code = `#!/bin/bash
if [ -f "file.txt" ]; then
    echo "Found"
fi
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("bash");
  });

  it("detects CSS code", () => {
    const code = `
@media (max-width: 768px) {
  .container {
    display: flex;
    background-color: #ff0000;
    font-size: 16px;
  }
}
`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("css");
  });

  it("detects JSON code", () => {
    const code = `{
  "name": "Lab Record System",
  "version": 1.0,
  "active": true
}`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("json");
  });

  it("detects XML code", () => {
    const code = `<?xml version="1.0" encoding="UTF-8"?>
<configuration xmlns:custom="http://example.com">
    <property name="env" value="prod"/>
</configuration>`;
    const result = detectLanguage(code);
    expect(result.detectedLanguage).toBe("xml");
  });

  it("retains current language on empty or ambiguous short text", () => {
    const result = detectLanguage("a = 1", { currentLanguage: "python" });
    expect(result.detectedLanguage).toBe("python");
  });
});

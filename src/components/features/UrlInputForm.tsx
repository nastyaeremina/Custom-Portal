"use client";

import { useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isValidUrl } from "@/lib/utils/url";

interface UrlInputFormProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  hasResult: boolean;
}

export function UrlInputForm({ onSubmit, isLoading, hasResult }: UrlInputFormProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) {
      setError("Please enter a website or email");
      return;
    }

    if (!isValidUrl(input)) {
      setError("Please enter a valid website or email");
      return;
    }

    setError("");
    onSubmit(input);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 max-w-lg mx-auto">
      <Input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setError("");
        }}
        placeholder="Enter yourwebsite.com or you@company.com"
        error={error}
        disabled={isLoading}
        className="flex-1"
      />
      <Button type="submit" isLoading={isLoading}>
        {hasResult ? "Generate again" : "Generate"}
      </Button>
    </form>
  );
}

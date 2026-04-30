import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { SPINNER_FRAMES } from "../types.js";

export function Spinner() {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 80);
        return () => clearInterval(id);
    }, []);

    return <Text>{SPINNER_FRAMES[frame]}</Text>;
}

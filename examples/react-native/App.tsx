import { useEffect, useState } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { MlsProvider, useMls, type Group } from "mls4rn-react-native";

// Show the tail of the ciphertext — the encrypted content, not the cleartext
// MLS framing metadata (group id, epoch) at the front.
function toHexTail(bytes: Uint8Array, n: number): string {
  return Array.from(bytes.slice(-n))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function Chat() {
  const mls = useMls();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [groups, setGroups] = useState<{ alice: Group; bob: Group } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await mls.ready();
        const alice = await mls.newClient("alice");
        const bob = await mls.newClient("bob");
        const group = await alice.createGroup("room");
        const add = await group.add(await bob.keyPackage());
        const bobGroup = await bob.joinGroup(add.welcome, add.ratchetTree, "room");
        if (cancelled) return;
        setGroups({ alice: group, bob: bobGroup });
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mls]);

  async function send() {
    if (!groups || !text.trim()) return;
    const message = text;
    setText("");
    const ciphertext = await groups.alice.send(message);
    const decrypted = await groups.bob.receiveText(ciphertext);
    setLog((l) => [
      ...l,
      `alice ▸ "${message}"`,
      `🔒 wire: …${toHexTail(ciphertext, 8)} (${ciphertext.length} B)`,
      `bob decrypts ▸ "${decrypted}"`,
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔐 mls4rn — React Native</Text>
      <Text style={styles.status}>
        {error ? `error: ${error}` : ready ? "✓ MLS running in a hidden WebView" : "loading WebAssembly…"}
      </Text>
      <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
        {log.map((line, i) => (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ))}
      </ScrollView>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="message as alice"
          placeholderTextColor="#8b93a7"
          editable={ready}
          onSubmitEditing={send}
        />
        <TouchableOpacity style={[styles.send, !ready && styles.disabled]} onPress={send} disabled={!ready}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <MlsProvider>
      <SafeAreaView style={styles.safe}>
        <Chat />
      </SafeAreaView>
    </MlsProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f1115" },
  container: { flex: 1, padding: 16 },
  title: { color: "#e6e8ee", fontSize: 18, fontWeight: "600" },
  status: { color: "#8b93a7", fontSize: 13, marginTop: 4, marginBottom: 12 },
  log: { flex: 1, backgroundColor: "#171a21", borderRadius: 12 },
  logContent: { padding: 12, gap: 6 },
  line: { color: "#e6e8ee", fontSize: 13, fontFamily: "Courier" },
  row: { flexDirection: "row", gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    backgroundColor: "#171a21",
    color: "#e6e8ee",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  send: { backgroundColor: "#3b82f6", borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  disabled: { opacity: 0.5 },
  sendText: { color: "white", fontWeight: "600" },
});

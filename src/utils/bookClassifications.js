export function getBookClassificationLabels(classifications = []) {
  const labels = new Map()
  for (const classification of classifications) {
    const parts = classification.split('/').map((part) => part.trim()).filter(Boolean)
    // Toon het onderwerp onder de hoofdrubriek; 'General' krijgt de bovenliggende rubriek.
    const label = parts[1] && parts[1].toLowerCase() !== 'general' ? parts[1] : parts[0]
    if (label && !labels.has(label.toLowerCase())) labels.set(label.toLowerCase(), label)
  }
  return [...labels.values()]
}

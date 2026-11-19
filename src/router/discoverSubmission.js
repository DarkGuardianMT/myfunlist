const submissions = new WeakSet()

export function isDiscoverSubmission(router) {
  return submissions.has(router.currentRoute.value)
}

export async function submitDiscoverSearch(router, location) {
  const target = router.resolve(location)
  // Alleen deze navigatie is een inzending; terug/vooruit krijgt een nieuw route-object.
  const remove = router.beforeResolve(to => {
    if (to.fullPath === target.fullPath) submissions.add(to)
  })
  try {
    return await router.push(location)
  } finally {
    remove()
  }
}

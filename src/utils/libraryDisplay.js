function compareTitles(firstItem, secondItem) {
  return firstItem.media.title.localeCompare(secondItem.media.title, undefined, {
    sensitivity: 'base',
  })
}

function getAddedTime(item) {
  const addedTime = Date.parse(item.userMedia.addedAt)

  return Number.isNaN(addedTime) ? 0 : addedTime
}

function compareRatings(firstItem, secondItem, direction) {
  const firstRating = firstItem.userMedia.rating
  const secondRating = secondItem.userMedia.rating

  if (firstRating === null && secondRating === null) {
    return compareTitles(firstItem, secondItem)
  }

  if (firstRating === null) {
    return 1
  }

  if (secondRating === null) {
    return -1
  }

  const ratingDifference =
    direction === 'rating-high-low'
      ? secondRating - firstRating
      : firstRating - secondRating

  return ratingDifference || compareTitles(firstItem, secondItem)
}

export function getVisibleLibraryItems(items, statusFilter, sortOrder) {
  const visibleItems =
    statusFilter === 'all'
      ? [...items]
      : items.filter((item) => item.userMedia.status === statusFilter)

  return visibleItems.sort((firstItem, secondItem) => {
    if (sortOrder === 'title') {
      return compareTitles(firstItem, secondItem)
    }

    if (sortOrder === 'rating-high-low' || sortOrder === 'rating-low-high') {
      return compareRatings(firstItem, secondItem, sortOrder)
    }

    return getAddedTime(secondItem) - getAddedTime(firstItem)
  })
}

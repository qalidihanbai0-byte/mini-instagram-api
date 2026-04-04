import random

n = 10
a = [random.randint(0, 99) for _ in range(n)]

print("Массив:")
print(a)
print()

min_xor = float('inf')
x, y = 0, 0

for i in range(n):
    for j in range(i + 1, n):
        res = a[i] ^ a[j]

        if res < min_xor:
            min_xor = res
            x = a[i]
            y = a[j]

print(f"{x:010b}")
print(f"{y:010b}")
print("----------")
print(f"{min_xor:010b}")

print("\nMin XOR =", min_xor)
print("Numbers:", x, "and", y)
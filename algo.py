import random

numbers = [random.randint(1, 10) for _ in range(7)]
target = 99
print(f"Массив: {numbers} | Нысана: {target}")

def find_complex_path(arr, target):
    n = len(arr)
    
    for i in range(n):
        for j in range(n):
            if i == j: continue
            
            intermediate = arr[i] ^ arr[j]
            
            for k in range(n):
                if k == i or k == j: continue
                
                for s in range(-3, 4):
                    if s > 0:
                        shifted = intermediate << s
                    elif s < 0:
                        shifted = intermediate >> abs(s)
                    else:
                        shifted = intermediate
                    
                    if (shifted ^ arr[k]) == target:
                        direction = "<<" if s >= 0 else ">>"
                        return f"Шешім табылды: ({arr[i]} ^ {arr[j]}) {direction} {abs(s)} ^ {arr[k]} = 99"
    
    return "Дәл 99 шығатын тізбек табылмады."

print(find_complex_path(numbers, target))
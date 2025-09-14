import U, {printAge as pA, printName} from '/user.js'

const user = new U('Bob', 11)
console.log(user)
pA(user)
printName(user)